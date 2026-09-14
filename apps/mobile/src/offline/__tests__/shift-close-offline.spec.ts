/**
 * A shift closed without signal, and the next one opened before it arrived.
 */
import { SyncEngine, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import {
  clockInFromPhone,
  clockOutFromPhone,
  pendingShiftCloses,
  resolveClockOutFromPhone,
} from '../attendance/shift-actions';

const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };
const FIX = { lat: 47.98, lng: 13.82, accuracy: 10, at: 0 } as never;

function engine() {
  const state = { online: false, now: 1_000_000 };
  let n = 0;
  const sent: { op: string; body: any }[] = [];
  const e = new SyncEngine({
    userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), records, now: () => state.now, random: () => 0.5,
    newId: () => `op-${String(++n).padStart(3, '0')}`,
    transport: {
      async push(ops) {
        if (!state.online) throw new Error('Network request failed');
        sent.push(...ops.map((o) => ({ op: o.op, body: o.payload.body })));
        return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' as const, body: {} })) };
      },
      async pull() { throw new Error('unused'); },
    },
  });
  return { e, state, sent };
}

it('a new clock-in waits for last night’s queued clock-out, though they are different lanes', async () => {
  const { e, state, sent } = engine();
  await e.start();
  await clockOutFromPhone(e, { entryId: 'yesterday', overtimeReason: 'Part arrived late' });
  state.now += 12 * 3_600_000;
  const { outcome } = await clockInFromPhone(e, { locationId: 'site', fix: FIX });
  expect(outcome.kind).toBe('queued');

  const clockIn = e.operations().find((o) => o.op === 'attendance.clockIn')!;
  const clockOut = e.operations().find((o) => o.op === 'attendance.clockOut')!;
  expect(clockIn.lane).not.toBe(clockOut.lane);
  expect(clockIn.dependsOn).toEqual([clockOut.id]);

  state.online = true;
  state.now += 60 * 60_000;
  for (let i = 0; i < 4; i++) await e.flush();
  expect(sent.map((s) => s.op)).toEqual(['attendance.clockOut', 'attendance.clockIn']);
  expect(sent[0]!.body.overtimeReason).toBe('Part arrived late');
});

it('names only closes still on their way', () => {
  const op = (id: string, name: string, state: string) => ({ id, op: name, state }) as never;
  expect(
    pendingShiftCloses([
      op('a', 'attendance.clockOut', 'pending'),
      op('b', 'attendance.clockOut', 'applied'),
      op('c', 'attendance.resolveClockOut', 'retry'),
      op('d', 'attendance.breakEnd', 'pending'),
    ]),
  ).toEqual(['a', 'c']);
});

it('"when did you leave?" sends nothing extra when that shift’s clock-out is already queued', async () => {
  const { e } = engine();
  await e.start();
  await clockOutFromPhone(e, { entryId: 'entry-1' });
  const outcome = await resolveClockOutFromPhone(e, { entryId: 'entry-1', clockOutAt: new Date(900_000) });
  expect(outcome.kind).toBe('queued');
  expect(e.operations().map((o) => o.op)).toEqual(['attendance.clockOut']);
});

it('"when did you leave?" is queued without signal and sent with the chosen time', async () => {
  const { e, state, sent } = engine();
  await e.start();
  const at = new Date('2026-09-14T16:35:00.000Z');
  expect((await resolveClockOutFromPhone(e, { entryId: 'entry-2', clockOutAt: at })).kind).toBe('queued');
  expect(pendingShiftCloses(e.operations())).toHaveLength(1);

  state.online = true;
  state.now += 60 * 60_000;
  await e.flush();
  expect(sent).toEqual([{ op: 'attendance.resolveClockOut', body: { clockOutAt: at.toISOString() } }]);
});
