import { STILL_MINE } from '../actions/outcome';
import type { OutboxOp } from './types';

type Body = Record<string, unknown> & { id?: string; entryId?: string };

/**
 * The still-unsent operation another one must wait for — its `dependsOn`.
 *
 * A clock-out waits for its clock-in, a message for the issue it is about, a
 * stage change for the client it is on. Every family asks the same question of
 * the outbox, which is why this lives here and not beside any one of them:
 * "is the thing I am about to reference still on its way, and under which
 * operation id?"
 *
 * Only OPEN states count. An operation already accepted needs no waiting, and
 * one the member has discarded must not hold anything up for ever.
 */
export function openOpFor(ops: readonly OutboxOp[], op: OutboxOp['op'], match: (body: Body) => boolean): OutboxOp | undefined {
  return ops.find((o) => o.op === op && STILL_MINE.has(o.state) && match((o.payload.body ?? {}) as Body));
}
