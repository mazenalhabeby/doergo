import type { CompanyLocation } from '@prisma/client';
import { SHIFT_REMINDER_DEFAULTS, memberDayZone } from '@hbcfield/shared';
import { agreedOvertimeMinutes, type DayRequestRow } from '../core/approved-requests';
import { noShiftRefusal } from './clock-in-helpers';
import type { ClockInContextService } from './clock-in-context.service';
import type { ClockInUser } from './clock-in-steps';

/** A clock-in's planned end and reminder, as the stamp the on-site writer shapes. */
type ShiftStamp = Omit<Awaited<ReturnType<ClockInContextService['buildShiftStamp']>>, 'scheduled' | 'flagToleranceMin'>;

/*
  ── Clocking in with no shift ──
  The workspace decides: allow it, allow up to a number of hours a day, or
  only with a shift. A limit becomes the session's planned end, so counted
  time, reminders, overtime and the open-shift close all follow it.

  ⚠️ The limit is a MARKER, not a cut: counted time runs to the clock-out
  (CountedTimeService ignores an end that is only a daily limit), and time past
  it is flagged PAST_DAILY_LIMIT for the leader. With no hours left the clock-in
  is kept and flagged, never refused; only SHIFT_ONLY refuses.

  Writes the planned end / reminder into `stampCols` and PAST_DAILY_LIMIT into `flagReasons`.
*/
export async function applyNoShiftAllowance(
  context: ClockInContextService,
  userId: string,
  user: ClockInUser,
  location: CompanyLocation,
  workerTz: string | null,
  clockInTime: Date,
  io: { dayRequests: DayRequestRow[]; stampCols: ShiftStamp; flagReasons: string[] },
): Promise<{ endIsDailyLimit: boolean; shapingRequests: DayRequestRow[] }> {
  const { dayRequests, stampCols, flagReasons } = io;
  let endIsDailyLimit = false;
  // Overtime agreed in advance raises a no-shift day's limit INSIDE the allowance — so a member
  // already at the limit may clock in for it — and is then not added to the end a second time.
  let shapingRequests = dayRequests;
  const dayTz = memberDayZone(user.timezone, user.organization?.timezone, location.timezone || workerTz);
  const agreed = agreedOvertimeMinutes(dayRequests, location.id, clockInTime, dayTz);
  const allowance = await context.noShiftAllowanceFor(userId, location, clockInTime, dayTz, agreed);
  if (allowance.kind !== 'free' && agreed > 0) shapingRequests = dayRequests.filter((r) => r.kind !== 'OVERTIME');
  // Only a workspace that needs a shift refuses. No hours left is KEPT and flagged for the leader:
  // nothing is cut any more (docs/plans/time-counting-model.md), exactly as an offline clock-in always was.
  if (allowance.kind === 'refused' && allowance.reason === 'SHIFT_ONLY') {
    if (!flagReasons.includes('RECORDED_OFFLINE')) throw noShiftRefusal(allowance, location.name);
    // Recorded offline (the phone could not ask): kept, as a day without a shift for the leader — never the
    // daily-hours marker, which this workspace does not have (clock review B4).
    if (!flagReasons.includes('UNSCHEDULED_DAY')) flagReasons.push('UNSCHEDULED_DAY');
    return { endIsDailyLimit, shapingRequests };
  }
  if (allowance.kind !== 'free') {
    const end = allowance.kind === 'limited' ? allowance.until : clockInTime;
    stampCols.expectedClockOutAt = end;
    stampCols.nextRemindAt = new Date(
      Math.max(end.getTime(), Date.now()) + SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES * 60_000,
    );
    endIsDailyLimit = true;
    if (allowance.kind === 'refused') flagReasons.push('PAST_DAILY_LIMIT');
  }
  return { endIsDailyLimit, shapingRequests };
}
