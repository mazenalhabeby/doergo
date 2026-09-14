import { outcomeOf, STILL_MINE, type ActionOutcome } from '../actions/outcome';
import type { OutboxOp } from '../outbox/types';
import type { SyncEngine } from '../sync-engine';

/*
  A member's leave travels in one lane, `timeoff:<memberId>` — the same lane as
  a request made on the phone. So cancelling a request that has not reached the
  office yet simply follows it: the request arrives, then its cancellation.
*/
const laneOf = (memberId: string) => `timeoff:${memberId}`;

/** Cancel a pending time-off request, with or without signal. */
export async function cancelTimeOff(engine: SyncEngine, input: { memberId: string; timeOffId: string }): Promise<ActionOutcome> {
  const op = await engine.enqueueAndSettle({
    op: 'timeOff.cancel',
    lane: laneOf(input.memberId),
    entityId: input.timeOffId,
    payload: { params: { timeOffId: input.timeOffId } },
  });
  return outcomeOf(engine, op);
}

/** Requests with a cancellation still on the phone — shown as cancelled, marked unsent. */
export function pendingCancellations(ops: readonly Pick<OutboxOp, 'op' | 'state' | 'payload'>[]): Set<string> {
  return new Set(
    ops
      .filter((o) => o.op === 'timeOff.cancel' && STILL_MINE.has(o.state))
      .map((o) => o.payload.params?.timeOffId)
      .filter((id): id is string => !!id),
  );
}
