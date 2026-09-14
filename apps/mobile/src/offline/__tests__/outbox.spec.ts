/**
 * The outbox rules, without a phone.
 */
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).map((_, i) => (i * 37) % 256) }));

import { selectBatch } from '../outbox/scheduler';
import { applyPushFailure, applyPushResults, failDependency, markInflight, recoverInflight, resumeAuth } from '../outbox/transitions';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { uuidv7 } from '../ids';
import type { OutboxOp } from '../outbox/types';

const NOW = 1_757_849_000_000;
let seq = 0;
function op(over: Partial<OutboxOp> = {}): OutboxOp {
  seq++;
  return {
    id: over.id ?? `op-${String(seq).padStart(4, '0')}`,
    userId: 'u1', organizationId: 'o1', op: 'task.comment', lane: 'task:t1',
    dependsOn: [], payload: { params: { taskId: 't1' }, body: {} },
    state: 'pending', attempts: 0, createdAt: NOW + seq, updatedAt: NOW + seq,
    ...over,
  };
}

describe('uuidv7', () => {
  it('is a version-7 UUID that sorts by time', () => {
    const a = uuidv7(NOW);
    const b = uuidv7(NOW + 1);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(parseInt(a.replace(/-/g, '').slice(0, 12), 16)).toBe(NOW);
  });
});

describe('selectBatch', () => {
  it('sends a lane oldest first, and lanes side by side', () => {
    const a1 = op({ lane: 'task:a' }); const a2 = op({ lane: 'task:a' }); const b1 = op({ lane: 'task:b' });
    expect(selectBatch([a2, b1, a1], NOW).batch.map((o) => o.id)).toEqual([a1.id, a2.id, b1.id]);
  });

  it('holds a lane behind an operation in flight or waiting out its backoff', () => {
    const inflight = op({ state: 'inflight' }); const next = op();
    expect(selectBatch([inflight, next], NOW).batch).toEqual([]);
    const waiting = op({ lane: 'task:w', state: 'retry', nextAttemptAt: NOW + 5000 }); const behind = op({ lane: 'task:w' });
    const sel = selectBatch([waiting, behind], NOW);
    expect(sel.batch).toEqual([]);
    expect(sel.wakeAt).toBe(NOW + 5000);
  });

  it('retries once the backoff has passed', () => {
    const ready = op({ state: 'retry', nextAttemptAt: NOW - 1 });
    expect(selectBatch([ready], NOW).batch).toHaveLength(1);
  });

  it('does not let a refused operation hold its lane', () => {
    const refused = op({ state: 'failed' }); const later = op();
    expect(selectBatch([refused, later], NOW).batch.map((o) => o.id)).toEqual([later.id]);
  });

  it('fails what depends on a refused operation instead of sending it', () => {
    const refused = op({ state: 'conflict' }); const dependent = op({ dependsOn: [refused.id] });
    const sel = selectBatch([refused, dependent], NOW);
    expect(sel.batch).toEqual([]);
    expect(sel.dependencyFailed.map((o) => o.id)).toEqual([dependent.id]);
  });

  it('sends a dependency and its dependent together, in order', () => {
    const report = op({ op: 'task.complete', lane: 'task:t9' });
    const photo = op({ op: 'report.attachment', lane: 'task:t9', dependsOn: [report.id] });
    expect(selectBatch([photo, report], NOW).batch.map((o) => o.id)).toEqual([report.id, photo.id]);
  });

  it('waits for a dependency still open in another lane', () => {
    const clockIn = op({ lane: 'shift:e1', state: 'retry', nextAttemptAt: NOW + 1000 });
    const note = op({ lane: 'worklog:n1', dependsOn: [clockIn.id] });
    expect(selectBatch([clockIn, note], NOW).batch).toEqual([]);
  });

  it('caps a batch', () => {
    const many = Array.from({ length: 80 }, (_, i) => op({ lane: `task:${i}` }));
    expect(selectBatch(many, NOW).batch).toHaveLength(50);
  });

  it('never resends done or discarded operations', () => {
    expect(selectBatch([op({ state: 'done' }), op({ state: 'discarded' })], NOW).batch).toEqual([]);
  });
});

describe('transitions', () => {
  const mid = () => 0.5;

  it('settles each result the way the shared table says', () => {
    const [a, b, c, d, e] = [op(), op(), op(), op(), op()];
    const out = applyPushResults(markInflight([a, b, c, d, e], NOW), [
      { id: a.id, status: 'applied', body: { id: 'c1' } },
      { id: b.id, status: 'replayed', body: { id: 'c2' } },
      { id: c.id, status: 'conflict', code: 'TASK_REASSIGNED', current: { assignedToId: 'k' } },
      { id: d.id, status: 'rejected', code: 'HTTP_403', message: 'No' },
      { id: e.id, status: 'retry', code: 'HTTP_503' },
    ], NOW, mid);
    expect(out.map((o) => o.state)).toEqual(['done', 'done', 'conflict', 'failed', 'retry']);
    expect(out[0]!.response).toEqual({ id: 'c1' });
    expect(out[2]!.response).toEqual({ assignedToId: 'k' });
    expect(out[4]).toMatchObject({ attempts: 1, nextAttemptAt: NOW + 2000 });
  });

  it('puts an operation that was only waiting on its lane back to pending, without counting an attempt', () => {
    const a = op();
    const [out] = applyPushResults([a], [{ id: a.id, status: 'retry', code: 'LANE_WAITING' }], NOW, mid);
    expect(out).toMatchObject({ state: 'pending', attempts: 0 });
  });

  it('treats a missing result as a retry', () => {
    const [out] = applyPushResults([op()], [], NOW, mid);
    expect(out!.state).toBe('retry');
  });

  it('pauses on 401, retries on network and 5xx, fails on other 4xx', () => {
    expect(applyPushFailure([op()], 401, undefined, NOW)[0]!.state).toBe('awaiting_auth');
    expect(applyPushFailure([op()], null, undefined, NOW, mid)[0]).toMatchObject({ state: 'retry', lastError: { code: 'NETWORK' } });
    expect(applyPushFailure([op()], 502, undefined, NOW, mid)[0]!.state).toBe('retry');
    expect(applyPushFailure([op()], 400, 'BAD', NOW)[0]!.state).toBe('failed');
  });

  it('recovers operations a crash left in flight, and resumes after sign-in', () => {
    const stuck = op({ state: 'inflight' }); const waiting = op({ state: 'awaiting_auth' });
    expect(recoverInflight([stuck, waiting], NOW).map((o) => o.state)).toEqual(['pending']);
    expect(resumeAuth([stuck, waiting], NOW).map((o) => o.id)).toEqual([waiting.id]);
  });

  it('fails a dependent with a reason the member can read', () => {
    expect(failDependency([op()], NOW)[0]).toMatchObject({ state: 'failed', lastError: { code: 'DEPENDENCY_FAILED' } });
  });
});

describe('MemoryOutboxStore', () => {
  it('keeps members apart and prunes only finished work', async () => {
    const store = new MemoryOutboxStore();
    await store.save([op({ userId: 'u1', state: 'done', updatedAt: NOW - 10 }), op({ userId: 'u1', state: 'pending', updatedAt: NOW - 10 }), op({ userId: 'u2' })]);
    expect(await store.list('u1')).toHaveLength(2);
    expect(await store.prune('u1', NOW)).toBe(1);
    expect((await store.list('u1')).map((o) => o.state)).toEqual(['pending']);
  });
});
