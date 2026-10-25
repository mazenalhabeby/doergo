/**
 * When asking for MORE TIME makes sense (clock review A8 + B2) — one rule for the server, the web and the phone.
 *
 * More time moves a PLANNED END. A session with no planned end (a free no-shift day) or whose end is only the
 * daily-hours marker (`endIsDailyLimit`) has nothing to move: all of its time counts already, and an approval
 * there used to SET an end and cut the counted time (B2). And asking is the shift-scheduling Option's: without
 * it the button led to a refusal (A8).
 */
export interface MoreTimeEntry {
  expectedClockOutAt?: string | Date | null;
  endIsDailyLimit?: boolean | null;
  reminderState?: string | null;
}

/**
 * How long a request for more time waits before its deciders are asked AGAIN, once (clock review B10). It used to
 * stop every reminder and wait silently until the shift was closed, 12 hours later.
 */
export const EXTRA_TIME_ANSWER_WAIT_MIN = 30;

/** Why the server refuses a request for more time, or null when it may be asked. */
export function moreTimeRefusal(entry: MoreTimeEntry): 'EXTRA_TIME_NO_SHIFT' | null {
  return !entry.expectedClockOutAt || entry.endIsDailyLimit === true ? 'EXTRA_TIME_NO_SHIFT' : null;
}

/** Should a screen OFFER "Ask for more time" now: past the planned end, not already asked, the Option bought. */
export function mayAskForMoreTime(
  entry: MoreTimeEntry | null | undefined,
  ctx: { hasOption: boolean; now?: number },
): boolean {
  if (!entry || !ctx.hasOption || moreTimeRefusal(entry)) return false;
  if (entry.reminderState === 'OVERTIME_PENDING' || entry.reminderState === 'OVERTIME_APPROVED') return false;
  return new Date(entry.expectedClockOutAt as string | Date).getTime() <= (ctx.now ?? Date.now());
}
