import { OBJECT_STORE } from '@hbcfield/shared/storage';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AssetAccessService } from '../asset-access.service';
import { AssetCustodyService } from '../asset-custody.service';
import { AssetExpenseService } from '../asset-expense.service';
import { AssetNotifier } from '../asset-notifier.service';
import { ConfigService } from '@nestjs/config';

/**
 * Handing a thing over, and filing what was spent on it.
 *
 * The arithmetic of a handover is pinned in shared (`custody.spec.ts`); what is
 * asserted here is the part only the server can be trusted with — that the two
 * tables move together, and that custody, not a permission, is what decides
 * whether somebody may file an expense.
 */

const KIND_ONE_HOLDER = { holder: { enabled: true, members: true, clients: false, multiple: false, label: 'Driver' } };

/** Who is told. Its own rules are pinned in `asset-notifier.spec.ts`; here only WHEN it is asked. */
const notifier = { handedOver: jest.fn(), expenseSubmitted: jest.fn(), expenseDecided: jest.fn() };

describe('AssetCustodyService.handOver', () => {
  let service: AssetCustodyService;
  let tx: any;

  const prisma: any = {
    asset: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    customer: { findMany: jest.fn() },
    assetCustody: { findMany: jest.fn(), updateMany: jest.fn(), createMany: jest.fn() },
    assetHolder: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx = {
      assetCustody: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), createMany: jest.fn() },
      assetHolder: {
        // Read alongside the periods, so a no-op plan can still notice that the
        // mirror has drifted away from them.
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation((fn: any) => fn(tx));
    prisma.asset.findFirst.mockResolvedValue({ id: 'a1', category: { config: KIND_ONE_HOLDER } });
    prisma.user.findMany.mockResolvedValue([{ id: 'u2' }]);
    prisma.customer.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetCustodyService,
        { provide: PrismaService, useValue: prisma },
        { provide: AssetAccessService, useValue: { assertMay: jest.fn(), assetInOrg: jest.fn() } },
        { provide: AssetNotifier, useValue: notifier },
      ],
    }).compile();
    service = module.get(AssetCustodyService);
  });

  const call = (over: any = {}) =>
    service.handOver({
      id: 'a1', to: [{ userId: 'u2' }], userId: 'actor', userRole: 'ADMIN', organizationId: 'org1', ...over,
    } as any);

  it('closes the open period and opens the next, in one transaction', async () => {
    tx.assetCustody.findMany.mockResolvedValue([
      { id: 'c1', userId: 'u1', customerId: null, startedAt: new Date('2026-01-01'), endedAt: null },
    ]);

    await call();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.assetCustody.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['c1'] } } }),
    );
    expect(tx.assetCustody.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ userId: 'u2', assetId: 'a1' })] }),
    );
  });

  /*
    ⚠️ The invariant the whole feature rests on.

    `AssetHolder` is "who has it now" and every existing screen reads it;
    `AssetCustody` is the history. They are two views of ONE fact, so they move
    together or an asset ends up with a holder row saying one thing and an open
    period saying another — which nothing on any screen would reveal and no
    reader could repair.
  */
  it('moves the holder row in the SAME transaction, never separately', async () => {
    tx.assetCustody.findMany.mockResolvedValue([]);
    await call();
    expect(tx.assetHolder.deleteMany).toHaveBeenCalledWith({ where: { assetId: 'a1' } });
    expect(tx.assetHolder.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ userId: 'u2' })] }),
    );
    // Never through the non-transactional client.
    expect(prisma.assetHolder.deleteMany).not.toHaveBeenCalled();
  });

  it('takes it back to nobody when nobody is named', async () => {
    tx.assetCustody.findMany.mockResolvedValue([
      { id: 'c1', userId: 'u1', customerId: null, startedAt: new Date('2026-01-01'), endedAt: null },
    ]);
    await call({ to: [] });
    expect(tx.assetCustody.updateMany).toHaveBeenCalled();
    expect(tx.assetCustody.createMany).not.toHaveBeenCalled();
    expect(tx.assetHolder.createMany).not.toHaveBeenCalled();
  });

  it('writes nothing when the same person keeps it', async () => {
    // Saving a record without touching the driver must not chop one six-month
    // custody into a row per save.
    tx.assetCustody.findMany.mockResolvedValue([
      { id: 'c1', userId: 'u2', customerId: null, startedAt: new Date('2026-01-01'), endedAt: null },
    ]);
    tx.assetHolder.findMany.mockResolvedValue([{ userId: 'u2', customerId: null }]);
    await call();
    expect(tx.assetCustody.updateMany).not.toHaveBeenCalled();
    expect(tx.assetCustody.createMany).not.toHaveBeenCalled();
    expect(tx.assetHolder.deleteMany).not.toHaveBeenCalled();
  });

  /*
    ⚠️ The drift case, and the reason the mirror is read at all.

    A holder row naming somebody with NO open period makes "nobody" the answer
    to the wrong question: the plan compares against the periods, sees no
    change, and the stale row survives every attempt to clear it — permanently,
    with nothing on any screen to show why.
  */
  it('repairs a holder row that names somebody with no open period', async () => {
    tx.assetCustody.findMany.mockResolvedValue([]);
    tx.assetHolder.findMany.mockResolvedValue([{ userId: 'ghost', customerId: null }]);
    await call({ to: [] });
    expect(tx.assetHolder.deleteMany).toHaveBeenCalledWith({ where: { assetId: 'a1' } });
    expect(tx.assetHolder.createMany).not.toHaveBeenCalled();
  });

  /*
    Announced AFTER the transaction, with the plan that was written — never from
    inside it, where a push could announce a handover that is then rolled back.
  */
  it('announces the handover once it has been written', async () => {
    const order: string[] = [];
    prisma.$transaction.mockImplementation(async (fn: any) => { const r = await fn(tx); order.push('committed'); return r; });
    notifier.handedOver.mockImplementation(async () => { order.push('announced'); });
    tx.assetCustody.findMany.mockResolvedValue([
      { id: 'c1', userId: 'u1', customerId: null, startedAt: new Date('2026-01-01'), endedAt: null },
    ]);

    await call();

    expect(order).toEqual(['committed', 'announced']);
    expect(notifier.handedOver).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org1', assetId: 'a1', actorId: 'actor',
      plan: expect.objectContaining({ opening: [{ userId: 'u2' }] }),
    }));
  });

  it('announces nothing when the handover is refused', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await expect(call()).rejects.toBeInstanceOf(BadRequestException);
    expect(notifier.handedOver).not.toHaveBeenCalled();
  });

  it('refuses a person from another organization', async () => {
    // The id came back missing rather than accepted — the reason both lookups
    // are scoped to the organization rather than trusted from the picker.
    prisma.user.findMany.mockResolvedValue([]);
    await expect(call()).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses two holders on a type that holds one', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u2' }, { id: 'u3' }]);
    await expect(call({ to: [{ userId: 'u2' }, { userId: 'u3' }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a client where the kind is held by members', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 'c9' }]);
    await expect(call({ to: [{ customerId: 'c9' }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a handover dated into the future', async () => {
    tx.assetCustody.findMany.mockResolvedValue([]);
    const ahead = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await expect(call({ at: ahead })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('filing an expense is gated on custody', () => {
  let service: AssetExpenseService;
  const custody = { heldBy: jest.fn() };

  const prisma: any = {
    asset: { findFirst: jest.fn() },
    assetMoney: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    user: { findMany: jest.fn() },
  };

  const KIND_MONEY = {
    ...KIND_ONE_HOLDER,
    money: { enabled: true, categories: [{ label: 'Fuel', direction: 'out' }] },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.asset.findFirst.mockResolvedValue({ id: 'a1', name: 'Ford', category: { config: KIND_MONEY } });
    prisma.assetMoney.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'm1', ...data }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetExpenseService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (_k: string, d?: string) => d ?? '' } },
        { provide: AssetAccessService, useValue: { assertMay: jest.fn() } },
        { provide: AssetCustodyService, useValue: custody },
        { provide: AssetNotifier, useValue: notifier },
        { provide: OBJECT_STORE, useValue: { head: async () => ({ exists: true, sizeBytes: 1000 }) } },
      ],
    }).compile();
    service = module.get(AssetExpenseService);
  });

  const submit = (over: any = {}) =>
    service.submit({
      id: 'a1', category: 'Fuel', amountCents: 8141,
      userId: 'u1', userRole: 'EMPLOYEE', organizationId: 'org1', ...over,
    } as any);

  it('accepts one from the person who held it', async () => {
    custody.heldBy.mockResolvedValue(true);
    const res: any = await submit();
    expect(res.data.amountCents).toBe(8141);
  });

  /*
    ⚠️ Asked of the RECEIPT'S date, not of today.

    Yesterday's fuel has to be filable the morning after the van goes back —
    and a receipt for a van somebody has never driven must not be filable at
    all. Both fall out of asking about the day the money moved.
  */
  it('asks about the day the money moved, not today', async () => {
    custody.heldBy.mockResolvedValue(true);
    const when = '2026-08-15T10:00:00.000Z';
    await submit({ occurredAt: when });
    expect(custody.heldBy).toHaveBeenCalledWith('a1', 'u1', new Date(when));
  });

  it('refuses somebody who did not have it then', async () => {
    custody.heldBy.mockResolvedValue(false);
    await expect(submit()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.assetMoney.create).not.toHaveBeenCalled();
  });

  it('lets somebody who manages the register file against anything', async () => {
    custody.heldBy.mockResolvedValue(false);
    await submit({ canManageAssets: true });
    expect(prisma.assetMoney.create).toHaveBeenCalled();
  });

  /*
    ⚠️ A member's entry is SUBMITTED and counts for nothing until the office
    accepts it. Recorded on arrival, anybody holding a van could move the
    organization's figures by photographing a slip.
  */
  it('arrives waiting when it came from a member', async () => {
    custody.heldBy.mockResolvedValue(true);
    const res: any = await submit();
    expect(res.data.status).toBe('SUBMITTED');
  });

  it('counts immediately when the office typed it', async () => {
    // Asking them to approve their own typing is a queue of one that only ever
    // says yes — and would make the existing "log money" button behave
    // differently for no reason.
    custody.heldBy.mockResolvedValue(false);
    const res: any = await submit({ canManageAssets: true });
    expect(res.data.status).toBe('RECORDED');
  });

  it('asks the office about a member’s entry', async () => {
    custody.heldBy.mockResolvedValue(true);
    await submit();
    expect(notifier.expenseSubmitted).toHaveBeenCalledTimes(1);
    expect(notifier.expenseSubmitted).toHaveBeenCalledWith(expect.objectContaining({
      assetId: 'a1', authorId: 'u1', status: 'SUBMITTED', amountCents: 8141, category: 'Fuel',
    }));
  });

  /*
    ⚠️ The office's own entry asks nobody. Announcing it would put the office's
    bookkeeping in the office's own bell, once per line typed.
  */
  it('asks nobody about an entry the office typed itself', async () => {
    custody.heldBy.mockResolvedValue(false);
    await submit({ canManageAssets: true });
    expect(notifier.expenseSubmitted).not.toHaveBeenCalled();
  });

  it('asks nobody about a refused filing', async () => {
    custody.heldBy.mockResolvedValue(false);
    await expect(submit()).rejects.toBeInstanceOf(ForbiddenException);
    expect(notifier.expenseSubmitted).not.toHaveBeenCalled();
  });

  it('refuses a heading the kind does not declare', async () => {
    custody.heldBy.mockResolvedValue(true);
    await expect(submit({ category: 'Bribes' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a receipt dated in the future', async () => {
    custody.heldBy.mockResolvedValue(true);
    await expect(submit({ occurredAt: new Date(Date.now() + 5 * 86_400_000).toISOString() }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  /*
    ⚠️ A key from anywhere else must not be attachable here.

    The presign puts the object under `{org}/asset-receipts/{asset}/`, and this
    is the check that makes that prefix mean something — without it, a client
    could name any key in the bucket and have the link minted for them later.
  */
  it('refuses a receipt key that is not this asset’s', async () => {
    custody.heldBy.mockResolvedValue(true);
    await expect(submit({ receiptKey: 'other-org/asset-receipts/a9/x.jpg' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts one under this asset’s own prefix', async () => {
    custody.heldBy.mockResolvedValue(true);
    const key = 'org1/asset-receipts/a1/abc.jpg';
    const res: any = await submit({ receiptKey: key, receiptName: 'r.jpg', receiptMime: 'image/jpeg' });
    expect(res.data.receiptKey).toBe(key);
  });

  it('refuses a negative or zero amount however it is dressed up', async () => {
    custody.heldBy.mockResolvedValue(true);
    await expect(submit({ amountCents: 0 })).rejects.toBeInstanceOf(BadRequestException);
    // Negative would silently invert the entry: the DIRECTION carries the sign.
    const res: any = await submit({ amountCents: -500 });
    expect(res.data.amountCents).toBe(500);
    expect(res.data.direction).toBe('OUT');
  });
});

describe('reviewing one', () => {
  let service: AssetExpenseService;
  const prisma: any = { assetMoney: { updateMany: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetExpenseService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (_k: string, d?: string) => d ?? '' } },
        { provide: AssetAccessService, useValue: { assertMay: jest.fn() } },
        { provide: AssetCustodyService, useValue: { heldBy: jest.fn() } },
        { provide: AssetNotifier, useValue: notifier },
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = module.get(AssetExpenseService);
  });

  /*
    ⚠️ Only ever moves a SUBMITTED row, and the `where` says so rather than a
    read-then-write. Two people opening the queue at once would otherwise both
    see it pending, and the second decision would silently overwrite the first.
  */
  it('only ever moves one that is still waiting', async () => {
    prisma.assetMoney.updateMany.mockResolvedValue({ count: 1 });
    await service.review({ entryId: 'm1', decision: 'accept', userId: 'u', userRole: 'ADMIN', organizationId: 'org1' } as any);
    expect(prisma.assetMoney.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'SUBMITTED', organizationId: 'org1' }) }),
    );
  });

  it('refuses when it has already been decided', async () => {
    prisma.assetMoney.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.review({ entryId: 'm1', decision: 'accept', userId: 'u', userRole: 'ADMIN', organizationId: 'org1' } as any),
    ).rejects.toThrow();
    // A decision that did not happen is not announced — the second reviewer
    // must not send the member a contradicting push.
    expect(notifier.expenseDecided).not.toHaveBeenCalled();
  });

  it('tells the member what was decided, with the reason', async () => {
    prisma.assetMoney.updateMany.mockResolvedValue({ count: 1 });
    await service.review({
      entryId: 'm1', decision: 'reject', note: '  Not our van  ', userId: 'u', userRole: 'ADMIN', organizationId: 'org1',
    } as any);
    expect(notifier.expenseDecided).toHaveBeenCalledWith({
      entryId: 'm1', organizationId: 'org1', decision: 'reject', note: 'Not our van', reviewerId: 'u',
    });
  });
});
