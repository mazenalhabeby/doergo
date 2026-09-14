/**
 * Cancelling a pending time-off request with no signal.
 */
import { SyncEngine, type RecordsSink, type SyncTransport } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { cancelTimeOff, pendingCancellations } from '../timeoff/time-off-actions';

const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };

function engine(transport: SyncTransport) {
  let n = 0;
  return new SyncEngine({ userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), transport, records, newId: () => `op-${++n}` });
}

describe('cancelling time off offline', () => {
  it('queues on the request’s own lane, so a request made offline arrives before its cancellation', async () => {
    const pushed: string[][] = [];
    const e = engine({
      async push(ops) {
        pushed.push(ops.map((o) => `${o.op}:${o.lane}`));
        throw new Error('Network request failed');
      },
      async pull() {
        throw new Error('unused');
      },
    });
    await e.start();
    const outcome = await cancelTimeOff(e, { memberId: 'u1', timeOffId: 'to-1' });
    expect(outcome.kind).toBe('queued');
    const op = e.operations().find((o) => o.op === 'timeOff.cancel')!;
    expect(op.lane).toBe('timeoff:u1');
    expect(op.payload.params).toEqual({ timeOffId: 'to-1' });
    expect(op.entityId).toBe('to-1');
    expect(pendingCancellations(e.operations())).toEqual(new Set(['to-1']));
  });

  it('a refusal (already decided) comes back with its code and is not left in the queue', async () => {
    const e = engine({
      async push(ops) {
        return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'rejected' as const, code: 'TIME_OFF_DECIDED', message: 'decided' })) };
      },
      async pull() {
        throw new Error('unused');
      },
    });
    await e.start();
    const outcome = await cancelTimeOff(e, { memberId: 'u1', timeOffId: 'to-2' });
    expect(outcome).toMatchObject({ kind: 'refused', code: 'TIME_OFF_DECIDED' });
    expect(pendingCancellations(e.operations()).size).toBe(0);
  });
});
