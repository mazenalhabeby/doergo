/**
 * A crew action queued on the phone and refused by the server afterwards —
 * found per job, and said in words.
 */
import { refusedCrewCopy, refusedCrewOps } from '../tasks/refused-crew';
import type { OutboxOp } from '../outbox/types';

const t = (key: string, opts: Record<string, unknown> = {}) =>
  String(opts.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? ''));

const op = (over: Partial<OutboxOp>): OutboxOp => ({
  id: 'op', userId: 'u', organizationId: 'o', op: 'task.join' as never, lane: 'task:job1', entityId: 'job1', dependsOn: [],
  payload: { params: { taskId: 'job1' } } as never, state: 'failed', attempts: 1, createdAt: 1, updatedAt: 1, ...over,
});

describe('refusedCrewOps', () => {
  it('keeps refused crew actions on this job, newest first', () => {
    const ops = [
      op({ id: 'a', createdAt: 1 }),
      op({ id: 'b', createdAt: 2, op: 'task.selfIssue' as never }),
      op({ id: 'c', createdAt: 3, entityId: 'job2' }),
      op({ id: 'd', createdAt: 4, state: 'done' }),
      op({ id: 'e', createdAt: 5, op: 'task.status' as never }),
    ];
    expect(refusedCrewOps(ops, 'job1').map((o) => o.id)).toEqual(['b', 'a']);
    expect(refusedCrewOps(ops).map((o) => o.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('refusedCrewCopy', () => {
  it("names the action and gives the server's reason", () => {
    const copy = refusedCrewCopy(t, op({ lastError: { code: 'UNKNOWN_X', message: 'The job is not under way.' } }));
    expect(copy).toEqual({ title: "This wasn't saved", reason: 'The job is not under way.' });
  });
});
