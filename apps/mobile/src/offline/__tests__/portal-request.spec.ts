/**
 * A portal client's request, written with no signal.
 */
import { SyncEngine, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { outcomeOf } from '../actions/outcome';

const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };

describe('portal request offline', () => {
  it('is named on the phone, queued, and sent exactly once when the connection returns', async () => {
    let online = false;
    const applied = new Set<string>();
    let n = 0;
    let now = 1_000_000;
    const e = new SyncEngine({
      userId: 'cust-user', organizationId: 'o1', store: new MemoryOutboxStore(), records, newId: () => `op-${++n}`, now: () => now,
      transport: {
        async push(ops) {
          if (!online) throw new Error('Network request failed');
          return { ok: true, results: ops.map((o) => {
            const id = String((o.payload.body as { id?: string }).id);
            const status = applied.has(id) ? ('replayed' as const) : ('applied' as const);
            applied.add(id);
            return { id: o.id, status, body: { id } };
          }) };
        },
        async pull() { throw new Error('unused'); },
      },
    });
    await e.start();
    // What useQueuedCreate('portal.request') enqueues: the phone's id in the body.
    const id = '0192b3c4-0000-7000-8000-00000000abcd';
    const op = await e.enqueueAndSettle({ op: 'portal.request', lane: 'portal:cust-user', payload: { body: { id, categoryKey: 'leak', description: 'Tap drips' } } });
    const outcome = await outcomeOf(e, op);
    expect(outcome.kind).toBe('queued');
    online = true;
    now += 60 * 60_000;
    await e.flush();
    await e.flush();
    expect([...applied]).toEqual([id]);
    expect(e.operations().find((o) => o.op === 'portal.request')?.state).toBe('done');
  });
});
