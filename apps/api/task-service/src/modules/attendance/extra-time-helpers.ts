import type { Prisma } from '@prisma/client';
import { TimeEntryStatus } from '@hbcfield/shared';
import type { ExtraTimeDecisionMessage } from '@hbcfield/shared/microservices';

type ExtraTimeDecision = ExtraTimeDecisionMessage;

/** How long after its clock-out a shift's extra time may still be decided. */
const EXTRA_TIME_DECIDABLE_AFTER_CLOSE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A shift whose extra-time request a leader may still decide: open and waiting,
 * or closed within a week with the round still undecided.
 */
export function decidableExtraTimeWhere(
  now: Date,
  opts: { openMustBePending?: boolean } = {},
): Prisma.TimeEntryWhereInput {
  return {
    OR: [
      // Deciding an open shift is as it always was; LISTING one needs a request waiting.
      opts.openMustBePending
        ? { status: TimeEntryStatus.CLOCKED_IN, reminderState: 'OVERTIME_PENDING' as const }
        : { status: TimeEntryStatus.CLOCKED_IN },
      {
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutAt: { gte: new Date(now.getTime() - EXTRA_TIME_DECIDABLE_AFTER_CLOSE_MS) },
        overtimeRequests: { some: { status: 'PENDING_APPROVAL' as const } },
      },
    ],
  };
}

/** The moment a member asked for extra time: the tap, never in the future, never before the shift. */
export function respondedAt(occurredAt: string | null | undefined, clockInAt: Date, now: Date = new Date()): Date {
  const at = occurredAt ? new Date(occurredAt) : null;
  if (!at || Number.isNaN(at.getTime())) return now;
  if (at.getTime() > now.getTime()) return now;
  if (at.getTime() < clockInAt.getTime()) return clockInAt;
  return at;
}

/**
 * The end an approval of `minutes` moves a shift to: minutes after the end the
 * member was working to, never after the moment of approval. Pure and shared by
 * a leader's approval and a manager adding overtime to a closed shift.
 */
function overtimeEndFor(input: {
  expectedEndAt: Date | null;
  requestStartedAt: Date | null;
  clockOutAt: Date | null;
  now: Date;
  minutes: number;
}): Date {
  const base = input.expectedEndAt ?? input.requestStartedAt ?? input.clockOutAt ?? input.now;
  return new Date(base.getTime() + Math.round(input.minutes) * 60_000);
}

export { ExtraTimeDecision, EXTRA_TIME_DECIDABLE_AFTER_CLOSE_MS, overtimeEndFor };

/**
 * After more time is refused — by the office, or by nobody confirming a signature in
 * time — the member is NOT clocked out (decided 2026-10-18): what counts already stops
 * at the planned end, because a refused round never moved it. A fresh reminder cycle
 * starts so they are nudged to clock out now; the count is reset so a member whose
 * reminders ran out earlier gets a clean nudge, not an instant escalation. One write,
 * shared by every refusal path; an already-closed shift is left alone.
 */
export function refusalNudge(entryId: string, now: Date = new Date()): Prisma.TimeEntryUpdateManyArgs {
  return {
    where: { id: entryId, status: TimeEntryStatus.CLOCKED_IN },
    data: { reminderState: 'REMINDED', reminderCount: 0, nextRemindAt: now },
  };
}
