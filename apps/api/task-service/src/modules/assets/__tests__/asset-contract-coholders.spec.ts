import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hbcfield/shared';
import { AssetAccessService } from '../core/asset-access.service';
import { AssetCustodyService } from '../custody/asset-custody.service';
import { CustodyWriterService } from '../custody/custody-writer.service';
import { AssetContractService } from '../proposals/asset-contract.service';
import { ContractPlanService } from '../proposals/contract-plan.service';

/**
 * A contract replaces what ONE member holds. A co-holder of the old record keeps
 * their custody, and a record somebody still holds is never retired.
 */
const SHARED = {
  holder: { enabled: true, members: true, clients: false, multiple: true, max: 3, label: 'Operator' },
  fields: [{ label: 'Kennzeichen' }],
};
const FIELDS = { registration: 'GM-472 DK', vin: 'WF0YXXTTGYKA12345', manufacturer: 'Ford', model: 'Transit' };
const OLD = {
  id: 'c-old', assetId: 'a-ford', userId: 'u-ahmed', customerId: null,
  startedAt: new Date('2026-03-15'), endedAt: null, asset: { id: 'a-ford', name: 'GM-101 AA' },
};

describe('AssetContractService.apply — co-holders of the replaced record', () => {
  let service: AssetContractService;
  let tx: any;
  const custody = { apply: jest.fn().mockResolvedValue({ closing: [], opening: [], kept: [] }), announce: jest.fn(),
    othersHolding: jest.fn() };
  const prisma: any = {
    assetCategory: { findFirst: jest.fn().mockResolvedValue({ id: 'k1', config: SHARED }) },
    assetType: { findFirst: jest.fn() },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'u-ahmed' }) },
    assetCustody: { findMany: jest.fn().mockResolvedValue([OLD]) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx = {
      asset: { create: jest.fn().mockResolvedValue({ id: 'a-new', name: 'GM-472 DK' }), updateMany: jest.fn() },
      assetActivity: { create: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetContractService,
        ContractPlanService,
        { provide: PrismaService, useValue: prisma },
        AssetAccessService,
        { provide: AssetCustodyService, useValue: custody },
      ],
    }).compile();
    service = module.get(AssetContractService);
  });

  const call = { categoryId: 'k1', holderUserId: 'u-ahmed', fields: FIELDS, retireReplaced: true,
    userId: 'actor', userRole: 'ADMIN', organizationId: 'org1' };

  it('ends only this member’s period and does not retire a record Bea still holds', async () => {
    custody.othersHolding.mockResolvedValue([{ userId: 'u-bea' }]);
    const res: any = await service.apply(call as any);
    const close = custody.apply.mock.calls.find(([, i]: any) => i.assetId === 'a-ford')![1];
    expect(close.to).toEqual([{ userId: 'u-bea' }]);
    expect(tx.asset.updateMany).not.toHaveBeenCalled();
    expect(res.data.retired).toBe(false);
  });

  it('retires the old record when nobody else holds it', async () => {
    custody.othersHolding.mockResolvedValue([]);
    await service.apply(call as any);
    expect(tx.asset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['a-ford'] } }) }),
    );
  });
});

describe('AssetCustodyService.othersHolding', () => {
  it('is every open holder but the one named — clients included', async () => {
    const db: any = {
      assetCustody: {
        findMany: jest.fn().mockResolvedValue([
          { id: '1', userId: 'u-ahmed', customerId: null },
          { id: '2', userId: 'u-bea', customerId: null },
          { id: '3', userId: null, customerId: 'c-1' },
        ]),
      },
    };
    const svc = new AssetCustodyService({} as any, {} as any, {} as any, new CustodyWriterService());
    await expect(svc.othersHolding(db, 'a1', 'u-ahmed')).resolves.toEqual([{ userId: 'u-bea' }, { customerId: 'c-1' }]);
  });
});
