import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AssetAccessService } from '../asset-access.service';
import { AssetCustodyService } from '../asset-custody.service';
import { AssetContractService } from '../asset-contract.service';

/**
 * Accepting a contract: create the car, hand it over, retire the one it replaces.
 *
 * The arithmetic of the proposal is pinned in shared (`contract.spec.ts`). What
 * is asserted here is the part only the server can be trusted with — that the
 * plan is RECOMPUTED rather than accepted, that all three writes are one
 * transaction, and that the old custody is closed through the one service
 * allowed to write it.
 */

const VEHICLES = {
  holder: { enabled: true, members: true, clients: false, multiple: false, label: 'Driver' },
  fields: [{ label: 'Kennzeichen' }],
};

const FIELDS = {
  registration: 'GM-472 DK',
  vin: 'WF0YXXTTGYKA12345',
  manufacturer: 'Ford',
  model: 'Transit Custom',
};

describe('AssetContractService', () => {
  let service: AssetContractService;
  let tx: any;
  const custody = { apply: jest.fn() };

  const prisma: any = {
    assetCategory: { findFirst: jest.fn() },
    assetType: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    assetCustody: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const OLD = {
    id: 'c-old', assetId: 'a-ford', userId: 'u-ahmed', customerId: null,
    startedAt: new Date('2026-03-15'), endedAt: null,
    asset: { id: 'a-ford', name: 'GM-101 AA' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx = {
      asset: { create: jest.fn().mockResolvedValue({ id: 'a-new', name: 'GM-472 DK' }), updateMany: jest.fn() },
      assetActivity: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((fn: any) => fn(tx));
    prisma.assetCategory.findFirst.mockResolvedValue({ id: 'k1', config: VEHICLES });
    prisma.user.findFirst.mockResolvedValue({ id: 'u-ahmed' });
    prisma.assetCustody.findMany.mockResolvedValue([OLD]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetContractService,
        { provide: PrismaService, useValue: prisma },
        { provide: AssetAccessService, useValue: { assertMay: jest.fn() } },
        { provide: AssetCustodyService, useValue: custody },
      ],
    }).compile();
    service = module.get(AssetContractService);
  });

  const call = (over: any = {}) => ({
    categoryId: 'k1', holderUserId: 'u-ahmed', fields: FIELDS,
    userId: 'actor', userRole: 'ADMIN', organizationId: 'org1', ...over,
  });

  describe('preview', () => {
    it('names the three things that would happen', async () => {
      const res: any = await service.preview(call() as any);
      expect(res.data.canApply).toBe(true);
      expect(res.data.steps.map((s: any) => s.kind)).toEqual(['create', 'hand-over', 'close']);
      expect(res.data.steps).toContainEqual({ kind: 'close', assetId: 'a-ford', assetName: 'GM-101 AA' });
    });

    it('writes nothing', async () => {
      await service.preview(call() as any);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    /*
      ⚠️ Only what they hold OF THIS KIND is replaced.

      Somebody holds a van and a laptop at once; a vehicle contract says nothing
      about the laptop. This is what stops "and retire the old one" quietly
      taking away their tools.
    */
    it('looks only at what they hold of this kind', async () => {
      await service.preview(call() as any);
      expect(prisma.assetCustody.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u-ahmed', endedAt: null, asset: { categoryId: 'k1' },
          }),
        }),
      );
    });

    it('adds a retire step only when it is asked for', async () => {
      const off: any = await service.preview(call() as any);
      expect(off.data.steps.some((s: any) => s.kind === 'retire')).toBe(false);
      const on: any = await service.preview(call({ retireReplaced: true }) as any);
      expect(on.data.steps.some((s: any) => s.kind === 'retire')).toBe(true);
    });

    /*
      ⚠️ A custody cannot START in the future.

      A rental beginning next Monday, recorded today, would leave the vehicle
      held by NOBODY until then — every receipt in the gap falls out of both
      custodies and the totals stop adding up. Clamped, and the screen is told
      so it can say why.
    */
    it('clamps a term that begins later than today, and says so', async () => {
      const ahead = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const res: any = await service.preview(call({ fields: { ...FIELDS, startsOn: ahead } }) as any);
      expect(res.data.startClamped).toBe(true);
      expect(new Date(res.data.startsAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('refuses a kind from another organization', async () => {
      prisma.assetCategory.findFirst.mockResolvedValue(null);
      await expect(service.preview(call() as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a person from another organization', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.preview(call() as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a kind held by clients', async () => {
      prisma.assetCategory.findFirst.mockResolvedValue({
        id: 'k1', config: { holder: { enabled: true, members: false, clients: true } },
      });
      await expect(service.preview(call() as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('apply', () => {
    it('creates the record, hands it over and closes the old one, in ONE transaction', async () => {
      await service.apply(call() as any);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'GM-472 DK', manufacturer: 'Ford', model: 'Transit Custom',
            serialNumber: 'WF0YXXTTGYKA12345', categoryId: 'k1',
          }),
        }),
      );
      // Both halves through the custody service — the only writer of those two
      // tables. Reimplementing "close the old one" here would be a second
      // author for one fact.
      expect(custody.apply).toHaveBeenCalledTimes(2);
      expect(custody.apply).toHaveBeenCalledWith(tx, expect.objectContaining({
        assetId: 'a-new', to: [{ userId: 'u-ahmed' }],
      }));
      expect(custody.apply).toHaveBeenCalledWith(tx, expect.objectContaining({
        assetId: 'a-ford', to: [],
      }));
    });

    it('fills the KIND’s own fields from the reading', async () => {
      await service.apply(call() as any);
      const { details } = tx.asset.create.mock.calls[0][0].data;
      expect(details).toEqual([{ label: 'Kennzeichen', value: 'GM-472 DK' }]);
    });

    /*
      RETIRED, never deleted: it is what BILLABLE_ASSET_WHERE excludes, so this
      also stops the old vehicle being billed, while its jobs and its ledger
      stay exactly where they are.
    */
    it('retires the old record when asked, and never deletes it', async () => {
      await service.apply(call({ retireReplaced: true }) as any);
      expect(tx.asset.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'RETIRED' } }),
      );
    });

    it('leaves it on the books when not asked', async () => {
      await service.apply(call() as any);
      expect(tx.asset.updateMany).not.toHaveBeenCalled();
    });

    /*
      ⚠️ The plan is RECOMPUTED, never accepted from the request.

      A client that could name the record to retire could retire any record, so
      the DTO carries a reading and nothing else — and this proves the server
      ignores anything else that arrives.
    */
    it('ignores a client-supplied list of things to retire', async () => {
      await service.apply(call({
        steps: [{ kind: 'retire', assetId: 'a-somebody-elses' }],
        closeAssetId: 'a-somebody-elses',
      }) as any);
      expect(tx.asset.updateMany).not.toHaveBeenCalled();
      for (const [, args] of custody.apply.mock.calls) {
        expect(args.assetId).not.toBe('a-somebody-elses');
      }
    });

    it('refuses when nothing on the contract identifies the thing', async () => {
      // Never a record called "Untitled" that somebody finds on the bill three
      // months later.
      await expect(service.apply(call({ fields: {} }) as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts a typed name where the reader found none', async () => {
      await service.apply(call({ fields: { name: 'Spare van' } }) as any);
      expect(tx.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Spare van' }) }),
      );
    });

    it('records how the asset came to exist', async () => {
      await service.apply(call({ retireReplaced: true }) as any);
      expect(tx.assetActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'CREATED_FROM_CONTRACT',
            metadata: expect.objectContaining({ replaced: ['a-ford'], retired: true }),
          }),
        }),
      );
    });

    it('creates without replacing anything when they held nothing', async () => {
      prisma.assetCustody.findMany.mockResolvedValue([]);
      const res: any = await service.apply(call({ retireReplaced: true }) as any);
      expect(custody.apply).toHaveBeenCalledTimes(1);
      expect(tx.asset.updateMany).not.toHaveBeenCalled();
      expect(res.data.retired).toBe(false);
    });
  });

  describe('read', () => {
    it('turns text into fields and decides nothing', async () => {
      const res: any = await service.read({
        text: 'Amtliches Kennzeichen: GM-472 DK\nFahrgestellnummer: WF0YXXTTGYKA12345',
        userId: 'u', userRole: 'ADMIN', organizationId: 'org1',
      } as any);
      expect(res.data.registration.value).toBe('GM-472 DK');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses an empty page rather than returning an empty reading', async () => {
      await expect(service.read({ text: '   ', userId: 'u', userRole: 'ADMIN', organizationId: 'org1' } as any))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
