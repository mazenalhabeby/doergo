/**
 * "My entries" with no signal: an entry logged at the pump shows at once as
 * waiting, becomes the server's own row when it is delivered, and is never
 * shown twice.
 */
import { kindTemplate } from '@hbcfield/shared/client';
import { overlayMyLog, logEntriesDeliveredSince } from '../assets/log-overlay';
import type { OutboxOp, OutboxState } from '../outbox/types';
import type { HeldAsset, MyLogEntry } from '../../lib/api/assets';

const van: HeldAsset = {
  id: 'c1',
  assetId: 'a1',
  startedAt: '2026-09-01T08:00:00.000Z',
  endedAt: null,
  asset: { id: 'a1', name: 'Sprinter', status: 'ACTIVE', category: { id: 'k1', name: 'Vans', config: kindTemplate('vehicle')!.shape } },
  totals: { inCents: 0, outCents: 0, netCents: 0, entries: 0 },
};

type OpOver = Partial<Omit<OutboxOp, 'op'>> & { op?: string; body?: Record<string, unknown> };

function op(over: OpOver = {}): OutboxOp {
  const { body, ...rest } = over;
  return {
    id: 'op-1',
    userId: 'u1',
    organizationId: 'o1',
    op: 'log.create',
    lane: 'log:a1',
    entityId: 'a1',
    dependsOn: [],
    payload: {
      params: { assetId: 'a1' },
      body: { entryId: 'e-phone-1', logType: 'fuel', values: { odometer: 86412, amount: 6240 }, occurredAt: '2026-09-14T10:00:00.000Z', ...body },
    },
    state: 'pending',
    attempts: 0,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...rest,
  } as OutboxOp;
}

const serverRow = (id: string, over: Partial<MyLogEntry> = {}): MyLogEntry => ({
  id,
  assetId: 'a1',
  logType: 'fuel',
  category: 'Fuel',
  direction: 'OUT',
  amountCents: 5000,
  note: null,
  values: null,
  occurredAt: '2026-09-10T10:00:00.000Z',
  status: 'RECORDED',
  reviewNote: null,
  reviewedAt: null,
  hasReceipt: false,
  asset: { id: 'a1', name: 'Sprinter' },
  ...over,
});

describe('overlayMyLog', () => {
  it('shows a queued entry at once, marked waiting, drawn from the kind', () => {
    const rows = overlayMyLog([serverRow('old')], [op({ body: { receiptPending: true } })], [van], 500)!;
    expect(rows.map((r) => r.id)).toEqual(['e-phone-1', 'old']);
    const queued = rows[0]!;
    expect(queued.pendingSync).toBe(true);
    expect(queued.asset?.name).toBe('Sprinter');
    // The heading is the type's label and the amount comes off its money field.
    expect(queued.category).toBe('Fuel');
    expect(queued.amountCents).toBe(6240);
    expect(queued.direction).toBe('OUT');
    expect(queued.hasReceipt).toBe(true);
    expect(queued.occurredAt).toBe('2026-09-14T10:00:00.000Z');
    // Fuel needs approval: what the server will say is "waiting for the office".
    expect(queued.status).toBe('SUBMITTED');
  });

  it('a type without approval reads as recorded once it lands', () => {
    const [row] = overlayMyLog([], [op({ body: { logType: 'damage', values: { what: 'Dent' } } })], [van], 0)!;
    expect(row!.category).toBe('Damage');
    expect(row!.amountCents).toBe(0);
    expect(row!.status).toBe('RECORDED');
  });

  it("never shows an entry twice once the server lists it (matched on the phone's id)", () => {
    const delivered = op({ state: 'done', updatedAt: 2_000 });
    const rows = overlayMyLog([serverRow('e-phone-1', { status: 'SUBMITTED' })], [delivered], [van], 1_500)!;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pendingSync).toBeUndefined();
    expect(rows[0]!.status).toBe('SUBMITTED');

    // Even while it is still open on the phone, the server's copy wins.
    expect(overlayMyLog([serverRow('e-phone-1')], [op()], [van], 3_000)).toHaveLength(1);
  });

  it("keeps an entry delivered after the list was read — no longer waiting, with the server's answer", () => {
    const delivered = op({ state: 'done', updatedAt: 5_000, response: { data: { status: 'RECORDED' } } });
    const [row] = overlayMyLog([], [delivered], [van], 4_000)!;
    expect(row!.pendingSync).toBe(false);
    expect(row!.status).toBe('RECORDED');
    // Delivered BEFORE the read: the list is the truth about it — not added again.
    expect(overlayMyLog([], [delivered], [van], 6_000)).toEqual([]);
  });

  it('drops a refused entry — the Sync screen explains it, this list does not pretend', () => {
    for (const state of ['failed', 'conflict', 'discarded'] as OutboxState[]) {
      expect(overlayMyLog([], [op({ state })], [van], 0)).toEqual([]);
    }
  });

  it('counts every still-open state as waiting', () => {
    for (const state of ['pending', 'inflight', 'retry', 'awaiting_auth'] as OutboxState[]) {
      expect(overlayMyLog([], [op({ state })], [van], 0)![0]!.pendingSync).toBe(true);
    }
  });

  it('ignores every other operation', () => {
    expect(overlayMyLog([], [op({ op: 'expense.create' })], [van], 0)).toEqual([]);
  });

  it('shows queued entries with no server list, and stays null when there is nothing', () => {
    expect(overlayMyLog(null, [], [van], 0)).toBeNull();
    expect(overlayMyLog(null, [op()], [van], 0)).toHaveLength(1);
  });

  it('newest queued first', () => {
    const rows = overlayMyLog([], [
      op({ id: 'a', createdAt: 1, body: { entryId: 'first' } }),
      op({ id: 'b', createdAt: 2, body: { entryId: 'second' } }),
    ], [van], 0)!;
    expect(rows.map((r) => r.id)).toEqual(['second', 'first']);
  });

  it('an asset no longer held has no name rather than a wrong one', () => {
    const [row] = overlayMyLog([], [op()], [], 0)!;
    expect(row!.asset).toBeNull();
    expect(row!.category).toBe('fuel');
  });
});

describe('logEntriesDeliveredSince', () => {
  it('counts only log entries delivered after the read', () => {
    const ops = [
      op({ id: '1', state: 'done', updatedAt: 10 }),
      op({ id: '2', state: 'done', updatedAt: 30 }),
      op({ id: '3', state: 'pending', updatedAt: 40 }),
      op({ id: '4', op: 'task.status', state: 'done', updatedAt: 50 }),
    ];
    expect(logEntriesDeliveredSince(ops, 20)).toBe(1);
    expect(logEntriesDeliveredSince(ops, 100)).toBe(0);
  });
});
