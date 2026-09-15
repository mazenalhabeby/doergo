import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { kindTemplate } from '@hbcfield/shared';
import { AssetAccessService } from '../asset-access.service';
import { AssetLogService } from '../asset-log.service';
import { AssetLogReminderService } from '../asset-log-reminder.service';

/**
 * The logbook on the server: who may log, what a write does to the asset's
 * derived state, and that a reminder is said once.
 *
 * The arithmetic (values, due dates, credits) is pinned in shared
 * (`logbook.spec.ts`). What only the server can be trusted with is asserted
 * here — custody on the entry's date, approval, the recompute riding in the
 * same transaction as the write, workspace scoping, and the claim that makes a
 * reminder idempotent across replicas.
 */

const ORG = 'org-1';
const VAN = 'van-1';
const DEPOT = 'space-depot';
const vehicle = kindTemplate('vehicle')!.shape;

const member = { userId: 'ahmed', userRole: 'EMPLOYEE', organizationId: ORG };
const manager = { userId: 'office', userRole: 'MANAGER', organizationId: ORG, canManageAssets: true, canViewAllTasks: true };
const depotLead = { userId: 'lead', userRole: 'MANAGER', organizationId: ORG, viewAllSpaceIds: [DEPOT] };

function setup(opts: { held?: boolean; spaceId?: string | null } = {}) {
  const tx: any = {
    assetMoney: {
      create: jest.fn(async ({ data }: any) => ({ id: data.id ?? 'new-entry', ...data })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      delete: jest.fn(),
    },
    asset: { update: jest.fn(), findUnique: jest.fn(async () => ({ category: { config: vehicle } })) },
  };
  const prisma: any = {
    asset: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === VAN && where.organizationId === ORG
          ? { id: VAN, name: 'Sprinter', category: { config: vehicle, spaceId: opts.spaceId === undefined ? DEPOT : opts.spaceId } }
          : null,
      ),
      findUnique: jest.fn(async () => ({ logState: null })),
    },
    assetMoney: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    user: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const custody: any = { heldBy: jest.fn(async () => opts.held ?? false) };
  const expenses: any = { review: jest.fn(async () => ({ data: { status: 'RECORDED' } })), forgetReceipt: jest.fn() };
  const store: any = { head: jest.fn(async () => ({ exists: true, sizeBytes: 1000 })), presignUpload: jest.fn(async () => ({ url: 'u' })) };
  const service = new AssetLogService(prisma, new AssetAccessService(prisma), custody, expenses, store);
  return { service, prisma, tx, custody, expenses, store };
}

const fuel = { id: VAN, logType: 'fuel', values: { odometer: '86.412', litres: '52', amount: 7412 } };
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString();

describe('who may log', () => {
  it('refuses a holder-only type to somebody who did not hold it that day', async () => {
    const { service, custody } = setup({ held: false });
    const when = yesterday();
    await expect(service.create({ ...member, ...fuel, occurredAt: when })).rejects.toBeInstanceOf(ForbiddenException);
    // Asked of the ENTRY'S date, not of today.
    expect(custody.heldBy).toHaveBeenCalledWith(VAN, 'ahmed', new Date(when));
  });

  it('lets whoever held it that day log it', async () => {
    const { service, tx } = setup({ held: true });
    await service.create({ ...member, ...fuel });
    expect(tx.assetMoney.create).toHaveBeenCalled();
  });

  it('lets the office log anything, on any asset, without holding it', async () => {
    const { service, custody, tx } = setup({ held: false });
    await service.create({ ...manager, ...fuel });
    expect(custody.heldBy).not.toHaveBeenCalled();
    expect(tx.assetMoney.create).toHaveBeenCalled();
  });

  it('lets a colleague who can see the depot report a dent — damage is not holder-only', async () => {
    const { service, tx } = setup({ held: false });
    await service.create({ ...depotLead, id: VAN, logType: 'damage', values: { what: 'Mirror' } });
    expect(tx.assetMoney.create).toHaveBeenCalled();
  });

  it('but not a colleague whose grant is for another workspace', async () => {
    const { service } = setup({ held: false, spaceId: 'space-linz' });
    await expect(service.create({ ...depotLead, id: VAN, logType: 'damage', values: { what: 'Mirror' } })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an asset of another organization as not found', async () => {
    const { service } = setup({ held: true });
    await expect(service.create({ ...member, ...fuel, organizationId: 'org-2' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a type the kind does not declare, and answers that do not fit it', async () => {
    const { service } = setup({ held: true });
    await expect(service.create({ ...member, id: VAN, logType: 'jetwash', values: {} })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...member, id: VAN, logType: 'fuel', values: { odometer: '86412' } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a photo key from outside this asset’s prefix', async () => {
    const { service } = setup({ held: true });
    await expect(service.create({ ...member, ...fuel, receiptKey: 'org-2/asset-receipts/van-1/x.jpg' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...member, ...fuel, receiptKey: `${ORG}/asset-receipts/${VAN}/../../x.jpg` })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps a member to the backdating window, and lets the office type in history', async () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    const a = setup({ held: true });
    await expect(a.service.create({ ...member, ...fuel, occurredAt: old })).rejects.toBeInstanceOf(BadRequestException);
    const b = setup({ held: false });
    await b.service.create({ ...manager, ...fuel, occurredAt: old });
    expect(b.tx.assetMoney.create).toHaveBeenCalled();
  });
});

describe('what a write stores', () => {
  it('credits the author, stores values and meters, and files under the type', async () => {
    const { service, tx } = setup({ held: true });
    const res: any = await service.create({ ...member, ...fuel });
    const data = tx.assetMoney.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      authorId: 'ahmed',
      logType: 'fuel',
      category: 'Fuel',
      amountCents: 7412,
      direction: 'OUT',
      values: { odometer: 86412, litres: 52 },
      readings: { odometer: 86412 },
    });
    // The key never leaves; the type is always named.
    expect(res.data.receiptKey).toBeUndefined();
    expect(res.data.logType).toBe('fuel');
  });

  it('files a Cost entry with a NULL type, exactly as the ledger always has', async () => {
    const { service, tx } = setup({ held: true });
    await service.create({ ...member, id: VAN, logType: 'cost', values: { category: 'insurance', amount: 30000 } });
    expect(tx.assetMoney.create.mock.calls[0][0].data).toMatchObject({ logType: null, category: 'Insurance', amountCents: 30000 });
  });

  it('a member’s entry on a type needing approval waits, and moves nothing derived', async () => {
    const { service, tx } = setup({ held: true });
    await service.create({ ...member, ...fuel });
    expect(tx.assetMoney.create.mock.calls[0][0].data.status).toBe('SUBMITTED');
    expect(tx.asset.update).not.toHaveBeenCalled();
  });

  it('an entry that needs no approval counts at once and recomputes in the SAME transaction', async () => {
    const { service, tx, prisma } = setup({ held: true });
    await service.create({ ...member, id: VAN, logType: 'damage', values: { what: 'Dent', odometer: 90000 } });
    expect(tx.assetMoney.create.mock.calls[0][0].data.status).toBe('RECORDED');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.asset.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: VAN } }));
  });

  it('an id made on the phone files once: the second send returns the first', async () => {
    const { service, prisma, tx } = setup({ held: true });
    prisma.assetMoney.findUnique.mockResolvedValue({ id: 'phone-id-0000000001', authorId: 'ahmed', assetId: VAN, logType: 'fuel', receiptKey: null });
    const res: any = await service.create({ ...member, ...fuel, entryId: 'phone-id-0000000001' });
    expect(tx.assetMoney.create).not.toHaveBeenCalled();
    expect(res.data.id).toBe('phone-id-0000000001');
  });

  it('an id somebody else already used is refused, not returned', async () => {
    const { service, prisma } = setup({ held: true });
    prisma.assetMoney.findUnique.mockResolvedValue({ id: 'phone-id-0000000001', authorId: 'mira', assetId: VAN });
    await expect(service.create({ ...member, ...fuel, entryId: 'phone-id-0000000001' })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('the derived state', () => {
  it('stores the newest reading and where each due rule stands, and when to look again', async () => {
    const { service, tx } = setup();
    const now = new Date('2026-06-01T00:00:00Z');
    tx.assetMoney.findFirst.mockImplementation(async ({ where }: any) =>
      where.logType === 'oil_change'
        ? { id: 'oil-1', occurredAt: new Date('2026-01-31T10:00:00Z'), readings: { odometer: 86_412 } }
        : null,
    );
    tx.assetMoney.findMany.mockResolvedValue([
      { id: 'f2', occurredAt: new Date('2026-05-30'), readings: { odometer: 95_000 } },
      { id: 'oil-1', occurredAt: new Date('2026-01-31T10:00:00Z'), readings: { odometer: 86_412 } },
    ]);

    const state = await service.recompute(tx, VAN, undefined, now);

    // Only RECORDED entries are read, by type, newest first.
    expect(tx.assetMoney.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { assetId: VAN, logType: 'oil_change', status: 'RECORDED' },
    }));
    expect(tx.assetMoney.findMany.mock.calls[0][0].where).toMatchObject({ status: 'RECORDED', readings: { not: Prisma.DbNull } });
    expect(state.readings.odometer!.value).toBe(95_000);
    expect(state.due.map((d) => d.key)).toEqual(['oil_change']); // service never done: nothing due
    const written = tx.asset.update.mock.calls[0][0].data;
    expect(written.logState.due[0].dueReading).toBe(101_412);
    expect((written.logRemindAt as Date).toISOString()).toBe(state.due[0]!.remindAt);
  });

  it('an accepted log entry recomputes its asset; an accepted cost does not need to', async () => {
    const a = setup();
    a.prisma.assetMoney.findFirst.mockResolvedValue({ assetId: VAN, logType: 'oil_change' });
    await a.service.review({ ...manager, entryId: 'e1', decision: 'accept' });
    expect(a.expenses.review).toHaveBeenCalled();
    expect(a.tx.asset.update).toHaveBeenCalled();

    const b = setup();
    b.prisma.assetMoney.findFirst.mockResolvedValue({ assetId: VAN, logType: null });
    await b.service.review({ ...manager, entryId: 'e2', decision: 'accept' });
    expect(b.tx.asset.update).not.toHaveBeenCalled();
  });

  it('removing: the office may; an author may withdraw only their own waiting entry', async () => {
    const own = setup();
    own.prisma.assetMoney.findFirst.mockResolvedValue({ id: 'e1', assetId: VAN, authorId: 'ahmed', status: 'SUBMITTED', receiptKey: 'k', logType: 'fuel' });
    await own.service.remove({ ...member, id: VAN, entryId: 'e1' });
    expect(own.tx.assetMoney.delete).toHaveBeenCalled();
    expect(own.expenses.forgetReceipt).toHaveBeenCalledWith('k');

    const accepted = setup();
    accepted.prisma.assetMoney.findFirst.mockResolvedValue({ id: 'e1', assetId: VAN, authorId: 'ahmed', status: 'RECORDED', receiptKey: null, logType: 'fuel' });
    await expect(accepted.service.remove({ ...member, id: VAN, entryId: 'e1' })).rejects.toBeInstanceOf(ForbiddenException);
    await accepted.service.remove({ ...manager, id: VAN, entryId: 'e1' });
    expect(accepted.tx.asset.update).toHaveBeenCalled();
  });
});

describe('reading the log', () => {
  it('is refused to a space-scoped reader of another workspace, as not found', async () => {
    const { service } = setup({ spaceId: 'space-linz' });
    await expect(service.list({ ...depotLead, id: VAN })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.summary({ ...depotLead, id: VAN })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is refused to a member with no reading grant at all', async () => {
    const { service } = setup();
    await expect(service.list({ ...member, id: VAN })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('pages newest first, filters a cost as NULL, and never returns a key', async () => {
    const { service, prisma } = setup();
    prisma.assetMoney.findMany.mockResolvedValue([
      { id: 'b', occurredAt: new Date(), receiptKey: 'secret', logType: null, authorId: 'ahmed' },
      { id: 'a', occurredAt: new Date(), receiptKey: null, logType: null, authorId: 'ahmed' },
    ]);
    const res: any = await service.list({ ...depotLead, id: VAN, logType: 'cost', limit: 1 });
    expect(prisma.assetMoney.findMany.mock.calls[0][0].where).toMatchObject({ assetId: VAN, logType: null });
    expect(res.data.entries).toHaveLength(1);
    expect(res.data.entries[0]).toMatchObject({ id: 'b', hasReceipt: true, logType: 'cost' });
    expect(JSON.stringify(res.data)).not.toContain('secret');
    expect(res.data.nextCursor).toBe('b');
  });

  it('credits who spent what to the author, counted once', async () => {
    const { service, prisma } = setup();
    prisma.assetMoney.findMany.mockResolvedValue([
      { authorId: 'ahmed', amountCents: 7000, direction: 'OUT', logType: 'fuel' },
      { authorId: 'mira', amountCents: 3000, direction: 'OUT', logType: 'fuel' },
    ]);
    const res: any = await service.summary({ ...manager, id: VAN });
    expect(prisma.assetMoney.findMany.mock.calls[0][0].where.status).toBe('RECORDED');
    expect(res.data.byAuthor.map((a: any) => [a.authorId, a.outCents])).toEqual([['ahmed', 7000], ['mira', 3000]]);
    expect(res.data.byType.find((t: any) => t.logType === 'fuel').outCents).toBe(10000);
  });
});

describe('the due sweep', () => {
  const now = new Date('2026-06-01T06:00:00Z');
  const overdueState = {
    readings: { odometer: { value: 102_000, at: '2026-05-30T00:00:00Z', entryId: 'f9' } },
    due: [{
      key: 'oil_change', lastEntryId: 'oil-1', lastDoneAt: '2026-01-31T10:00:00.000Z', lastReading: 86_412,
      meterKey: 'odometer', dueAt: '2027-01-31T10:00:00.000Z', dueReading: 101_412,
      remindAt: '2027-01-01T10:00:00.000Z', remindReading: 100_412,
    }],
    computedAt: '2026-05-30T00:00:00Z',
  };

  function sweepSetup() {
    const prisma: any = {
      asset: {
        findMany: jest.fn(async () => [{ id: VAN, name: 'Sprinter', organizationId: ORG, logState: overdueState, category: { config: vehicle, spaceId: DEPOT } }]),
        updateMany: jest.fn(),
      },
      assetLogReminder: { create: jest.fn() },
      assetCustody: { findMany: jest.fn(async () => [{ userId: 'ahmed' }]) },
      spaceAssignment: { findMany: jest.fn(async () => []) },
      accessRole: { findMany: jest.fn(async () => []) },
      user: { findMany: jest.fn(async () => [{ id: 'owner' }]) },
    };
    const routing: any = { resolveWatchers: jest.fn(async () => ({ ids: [], emails: [] })) };
    const notifications: any = { emit: jest.fn() };
    const { AssetResponsibleService } = require('../asset-responsible.service');
    const service = new AssetLogReminderService(prisma, routing, new AssetResponsibleService(prisma), notifications);
    return { service, prisma, notifications };
  }

  it('asks the index for what is due, and nothing else', async () => {
    const { service, prisma } = sweepSetup();
    await service.sweep(now);
    expect(prisma.asset.findMany.mock.calls[0][0].where).toEqual({ logRemindAt: { lte: now } });
  });

  it('claims the reminder, tells the holder and — with nobody routed — the managers', async () => {
    const { service, prisma, notifications } = sweepSetup();
    expect(await service.sweep(now)).toBe(1);
    expect(prisma.assetLogReminder.create).toHaveBeenCalledWith({
      data: { organizationId: ORG, assetId: VAN, logType: 'oil_change', windowKey: 'oil-1', stage: 'OVERDUE' },
    });
    expect(notifications.emit).toHaveBeenCalledWith('asset_log_due', expect.objectContaining({
      assetId: VAN,
      recipientIds: ['ahmed', 'owner'],
      items: [expect.objectContaining({ logType: 'oil_change', stage: 'overdue', unitsLeft: -588 })],
    }));
    // Looked at again only when a date can change something.
    expect(prisma.asset.updateMany).toHaveBeenCalledWith({ where: { id: VAN }, data: { logRemindAt: new Date('2027-01-01T10:00:00.000Z') } });
  });

  it('says nothing the second time: the unique index refuses the claim', async () => {
    const { service, prisma, notifications } = sweepSetup();
    prisma.assetLogReminder.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    expect(await service.sweep(now)).toBe(0);
    expect(notifications.emit).not.toHaveBeenCalled();
    expect(prisma.asset.updateMany).toHaveBeenCalled();
  });

  it('stays silent about a rule the kind has since removed', async () => {
    const { service, prisma, notifications } = sweepSetup();
    const noRules = { ...vehicle, logTypes: vehicle.logTypes.map((t) => ({ ...t, due: null })) };
    prisma.asset.findMany.mockResolvedValue([{ id: VAN, name: 'Sprinter', organizationId: ORG, logState: overdueState, category: { config: noRules, spaceId: DEPOT } }]);
    expect(await service.sweep(now)).toBe(0);
    expect(prisma.assetLogReminder.create).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
  });
});
