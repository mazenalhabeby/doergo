/**
 * "I'm working extra time" with no signal, then clocking out with no signal.
 */
import { SyncEngine, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { clockOutFromPhone, requestExtraTimeFromPhone } from '../attendance/shift-actions';

const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };

it('the request reaches the server before that shift’s clock-out, with the moment it was asked', async () => {
  let online = false;
  let now = 1_000_000;
  let n = 0;
  const sent: { op: string; body: any }[] = [];
  const e = new SyncEngine({
    userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), records, now: () => now, random: () => 0.5,
    newId: () => `op-${String(++n).padStart(3, '0')}`,
    transport: {
      async push(ops) {
        if (!online) throw new Error('Network request failed');
        sent.push(...ops.map((o) => ({ op: o.op, body: o.payload.body })));
        return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' as const, body: {} })) };
      },
      async pull() { throw new Error('unused'); },
    },
  });
  await e.start();
  expect((await requestExtraTimeFromPhone(e, { entryId: 'entry-1' })).kind).toBe('queued');
  now += 90 * 60_000;
  await clockOutFromPhone(e, { entryId: 'entry-1' });
  const lanes = e.operations().map((o) => o.lane);
  expect(new Set(lanes)).toEqual(new Set(['shift:entry-1']));

  online = true;
  now += 60 * 60_000;
  await e.flush();
  await e.flush();
  expect(sent.map((s) => s.op)).toEqual(['attendance.extraTime', 'attendance.clockOut']);
  expect(typeof sent[0]!.body.occurredAt).toBe('string');
});
