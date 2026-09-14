/**
 * Changes that cancel each other out before they were ever sent.
 */
import { compact } from '../outbox/compaction';
import type { OutboxOp } from '../outbox/types';

let t = 1000;
const op = (over: Partial<OutboxOp>): OutboxOp => ({
  id: `op-${t}`, userId: 'u1', organizationId: 'o1', op: 'profile.update', lane: 'profile:u1', dependsOn: [],
  payload: { body: {} }, state: 'pending', attempts: 0, createdAt: t++, updatedAt: t, ...over,
}) as OutboxOp;

describe('compaction', () => {
  it('merges repeated profile changes into the newest, keeping every field’s latest value', () => {
    const a = op({ id: 'a', payload: { body: { presence: 'BUSY', timeFormat: '12h' } }, state: 'retry', attempts: 1 });
    const b = op({ id: 'b', payload: { body: { presence: 'AWAY' } }, state: 'retry', attempts: 2 });
    const c = op({ id: 'c', payload: { body: { presence: 'BUSY' } } });
    const out = compact([a, b, c], 5000);
    const byId = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(byId.a.state).toBe('discarded');
    expect(byId.b.state).toBe('discarded');
    expect(byId.c.payload.body).toEqual({ presence: 'BUSY', timeFormat: '12h' });
    expect(byId.c.state).toBe('pending');
  });

  it('never rewrites a change that has already been attempted', () => {
    const a = op({ id: 'a', payload: { body: { presence: 'BUSY' } } });
    const b = op({ id: 'b', payload: { body: { presence: 'AWAY' } }, state: 'retry', attempts: 1 });
    expect(compact([a, b], 5000)).toEqual([]);
  });

  it('leaves one being sent right now alone', () => {
    const a = op({ id: 'a', payload: { body: { presence: 'BUSY' } }, state: 'inflight', attempts: 1 });
    const b = op({ id: 'b', payload: { body: { presence: 'AWAY' } } });
    expect(compact([a, b], 5000)).toEqual([]);
  });

  it('drops a time-off request withdrawn before it ever left the phone', () => {
    const req = op({ id: 'r', op: 'timeOff.request', lane: 'timeoff:u1', payload: { params: { employeeId: 'u1' }, body: { id: 'to-1', startDate: '2026-10-01', endDate: '2026-10-02' } } });
    const cancel = op({ id: 'c', op: 'timeOff.cancel', lane: 'timeoff:u1', payload: { params: { timeOffId: 'to-1' } } });
    expect(compact([req, cancel], 5000).map((o) => [o.id, o.state])).toEqual([['r', 'discarded'], ['c', 'discarded']]);
  });

  it('sends both once the request may already be at the office', () => {
    const req = op({ id: 'r', op: 'timeOff.request', lane: 'timeoff:u1', state: 'retry', attempts: 1, payload: { body: { id: 'to-1' } } });
    const cancel = op({ id: 'c', op: 'timeOff.cancel', lane: 'timeoff:u1', payload: { params: { timeOffId: 'to-1' } } });
    expect(compact([req, cancel], 5000)).toEqual([]);
  });

  it('never touches evidence, or anything another change depends on', () => {
    const clockIn = op({ id: 'ci', op: 'attendance.clockIn', lane: 'shift:x', payload: { body: {} } });
    const clockIn2 = op({ id: 'ci2', op: 'attendance.clockIn', lane: 'shift:x', payload: { body: {} } });
    expect(compact([clockIn, clockIn2], 5000)).toEqual([]);
    const a = op({ id: 'a', payload: { body: { presence: 'BUSY' } } });
    const b = op({ id: 'b', payload: { body: { presence: 'AWAY' } } });
    const dependent = op({ id: 'd', op: 'task.comment', lane: 'task:1', dependsOn: ['a'] });
    expect(compact([a, b, dependent], 5000).map((o) => o.id)).toEqual([]);
  });
});

describe('compaction in the engine', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SyncEngine } = require('../sync-engine') as typeof import('../sync-engine');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MemoryOutboxStore } = require('../outbox/memory-store') as typeof import('../outbox/memory-store');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { updateOwnProfile } = require('../profile/profile-actions') as typeof import('../profile/profile-actions');

  it('three availability changes in a basement reach the server as one', async () => {
    let online = false;
    const pushed: { op: string; body: unknown }[][] = [];
    let now = 1_000_000;
    let n = 0;
    const engine = new SyncEngine({
      userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), now: () => now, random: () => 0.5,
      newId: () => `op-${String(++n).padStart(3, '0')}`,
      records: { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } },
      transport: {
        async push(ops) {
          if (!online) throw new Error('Network request failed');
          pushed.push(ops.map((o) => ({ op: o.op, body: o.payload.body })));
          return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' as const, body: {} })) };
        },
        async pull() { throw new Error('unused'); },
      },
    });
    await engine.start();
    for (const presence of ['BUSY', 'AWAY', 'BUSY'] as const) {
      now += 1000;
      await updateOwnProfile(engine, 'u1', { presence });
    }
    now += 60 * 60_000;
    online = true;
    await engine.flush();
    expect(pushed).toEqual([[{ op: 'profile.update', body: { presence: 'BUSY' } }]]);
  });
});
