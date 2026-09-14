import type { OutboxOp } from '../outbox/types';

/** States in which a queued change still counts for what the member sees. */
const STILL_MINE = new Set(['pending', 'inflight', 'retry', 'awaiting_auth']);

/**
 * The task as the member sees it: the server's copy with their own changes the
 * server has not accepted yet laid on top.
 *
 * Never written anywhere — computed on every read, so the server's copy is
 * never overwritten by a guess, and a refused change disappears from the screen
 * the moment it is refused.
 */
export function overlayTask<T extends { id: string; status: string }>(
  task: T,
  ops: readonly OutboxOp[],
): T & { pendingSync: boolean } {
  let status = task.status;
  let pending = false;
  for (const op of ops) {
    if (op.entityId !== task.id || !STILL_MINE.has(op.state)) continue;
    pending = true;
    if (op.op === 'task.status') {
      const body = (op.payload.body ?? {}) as { status?: string };
      if (body.status) status = body.status;
    }
  }
  return { ...task, status, pendingSync: pending };
}

export interface LocalComment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string };
  pendingSync?: boolean;
}

/**
 * Notes the member wrote that have not reached the server yet, shaped like the
 * API's comments so the thread renders them in place, marked as pending.
 */
export function pendingComments(
  taskId: string,
  ops: readonly OutboxOp[],
  me: { id: string; firstName?: string; lastName?: string },
): LocalComment[] {
  return ops
    .filter((o) => o.op === 'task.comment' && o.entityId === taskId && STILL_MINE.has(o.state))
    .map((o) => {
      const body = (o.payload.body ?? {}) as { id?: string; content?: string };
      return {
        id: body.id ?? o.id,
        content: body.content ?? '',
        createdAt: new Date(o.createdAt).toISOString(),
        user: { id: me.id, firstName: me.firstName ?? '', lastName: me.lastName ?? '' },
        pendingSync: true,
      };
    });
}

/**
 * Merge the server's notes with pending ones: a note the server already has
 * (same id — the phone named it) is shown once, as the server's.
 */
export function mergeComments<C extends { id: string; createdAt: string }>(server: readonly C[], pending: readonly LocalComment[]) {
  const known = new Set(server.map((c) => c.id));
  return [...server, ...pending.filter((p) => !known.has(p.id))].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
