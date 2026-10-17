/** The shift card's states and schedule kinds, and the progress through a day (moved here unchanged) */
import type { BreakPlanItem, TimeEntry } from '@hbcfield/shared/client';

/**
 * WHICH OF THE EIGHT THE SHIFT CARD IS IN, DECIDED ONCE.
 *
 * Kept out of the component because this card is the most-used surface in the
 * app and its states are exactly the kind of thing that grows a ninth branch
 * inside a JSX conditional at six in the evening. Everything here is pure, so
 * the arithmetic can be read and tested without a renderer.
 *
 * ⚠️ EIGHT IS THE COMPLETE SET. `shift-clock.md` §1 lists them and there is no
 * ninth. ⑤ is not one of them in the code: QUEUED is a CHIP on ②, because the
 * shift is identical — the office simply has not heard about it yet — and
 * making it a state would mean writing ② twice.
 */
export type ShiftStateKind =
  /** ① Clocked out, before the shift. The hero is the NEXT thing, not a zero. */
  | 'before'
  /** ② On the clock. */
  | 'working'
  /** ③ On a rest — the counted figure freezes, and the card SAYS it has. */
  | 'resting'
  /** ④ Rest overdue. The one state where the filled disc is not the obvious one. */
  | 'restOverdue'
  /** ⑥ Clocked out, finished today. The hero is what they EARNED. */
  | 'done'
  /** ⑦ A shift left open, closed at a temporary time, waiting for the real one. */
  | 'unconfirmed';

/**
 * What this person is measured against.
 *
 * ⚠️ AND WHAT HAPPENS WHEN THE SERVER HAS NOT SAID. `User.scheduleType` exists
 * in the database and is NOT in the login payload — §2 asks for it to be added
 * beside `allowRemote`, which is a server change. Until it arrives, `unknown`
 * is answered from the DATA rather than by guessing: a shift the roster gave a
 * start and an end to IS a fixed one, and a shift with neither is measured
 * against nothing. Defaulting to FIXED would draw a progress bar against an
 * invented target for the unconfigured majority, which is rule 6 broken by a
 * fallback.
 */
export type ScheduleKind = 'FIXED' | 'FLEXIBLE' | 'NONE';

interface ShiftState {
  kind: ShiftStateKind;
  /** ⑤ Not a state of its own — a chip on ②. The clock-in is in the outbox. */
  queued: boolean;
  /** Minutes the hero counts, or null when the hero is not a duration. */
  minutes: number | null;
  /** A wall-clock hero — the rostered start, when that is what is promised. */
  at: Date | null;
  /** Counted so far. ⚠️ Never called "paid". */
  countedMinutes: number | null;
  /**
   * ③ — does the rest being taken COUNT?
   *
   * ⚠️ A rest the plan says counts (`isPaid` on the break or its rule) keeps
   * the counted figure moving. Freezing it and captioning `not counting now`
   * was false for every counted breather, and the figure then JUMPED by the
   * rest's length the moment it ended — the server never subtracted it.
   * False outside ③.
   */
  restCounts: boolean;
  workspace: string | null;
  /** The next planned rest, if the shift has a plan. */
  nextRest: BreakPlanItem | null;
  /** How many minutes ago the rest fell due. Positive only in `restOverdue`. */
  restOverdueBy: number;
  /**
   * ③ — when the rest is planned to end.
   *
   * ⚠️ THE PLANNED LENGTH, NOT A GUESS. `Back at 11:24` is a promise, so it
   * comes from the plan's own `durationMinutes` for the rule this rest
   * satisfies, and is null when the rest was taken outside any plan — where
   * the honest answer is that nobody said how long it is.
   */
  backAt: Date | null;
  /** Minutes until the rostered start. Positive only in ① with a roster. */
  startsInMinutes: number | null;
  /** ① FLEXIBLE — working days left in the month, for the caption. */
  workingDaysLeft: number | null;
  /** ① NONE — when they last clocked in, for `last in on Friday`. */
  lastInOn: Date | null;
  /**
   * ⑥ — the shift that just ended, for `06:45 → 15:00`.
   *
   * ⚠️ `approved` IS NOT `!awaitingApproval`. A REJECTED entry is neither
   * waiting nor approved, and reading "not pending" as "approved" printed
   * `counted and approved` under a shift the office had just refused.
   */
  finished: { from: Date; to: Date; awaitingApproval: boolean; approved: boolean; rejected: boolean } | null;
  /** Progress against what this person is measured against, or null for NONE. */
  /** `past`: beyond the rostered end (FIXED) — overtime even when `done` is short of `target`. */
  progress: { done: number; target: number; past?: boolean } | null;
  /** Which question the hero answers, so the card can label it. */
  schedule: ScheduleKind;
}

const MIN = 60_000;

/**
 * Working days left in this month, counting today.
 *
 * ⚠️ MONDAY TO FRIDAY, AND THAT IS AN APPROXIMATION THE CAPTION OWNS. Public
 * holidays and a member's own leave are not known here, and asking for them
 * would turn one courtesy line into two requests. The sentence says "working
 * days left", which is what this counts; it is not a promise about anybody's
 * rota.
 */
export function workingDaysLeftIn(now: Date): number {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let days = 0;
  for (let d = now.getDate(); d <= end; d += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), d).getDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

/**
 * ⚠️ `NONE` RENDERS NO PROGRESS TRACK — rule 6. A bar with no target invents
 * one, and NONE is the column's default, so the unconfigured majority would be
 * measured against a number nobody promised them.
 *
 * ⚠️ AND OVERTIME MEANS THREE DIFFERENT THINGS: past the rostered end for
 * FIXED, past the monthly budget for FLEXIBLE, nothing at all for NONE. That
 * is why the target comes from a different place in each branch rather than
 * from one "target hours" field that would have to mean all three.
 */
function progressFor(
  schedule: ScheduleKind,
  entry: TimeEntry | null,
  todayMinutes: number,
  monthMinutes: number | null,
  budgetHours: number | null,
  now: Date = new Date(),
): ShiftState['progress'] {
  if (schedule === 'FIXED') {
    const start = entry?.expectedClockInAt ? new Date(entry.expectedClockInAt) : null;
    const end = entry?.expectedClockOutAt ? new Date(entry.expectedClockOutAt) : null;
    if (!start || !end) return null;
    const target = Math.round((end.getTime() - start.getTime()) / MIN);
    // Past the rostered END is overtime even when a late start left the total short.
    return target > 0 ? { done: todayMinutes, target, past: now.getTime() > end.getTime() + MIN } : null;
  }
  if (schedule === 'FLEXIBLE') {
    if (!budgetHours || budgetHours <= 0 || monthMinutes === null) return null;
    return { done: monthMinutes, target: Math.round(budgetHours * 60) };
  }
  return null;
}

/**
 * The schedule this member is on.
 *
 * ⚠️ THE DEFAULT IS `NONE`, AND IT IS THE HONEST ONE. `scheduleType` is the
 * column's own default, so an unconfigured member should see the NONE card —
 * a record of what they worked — and NOT a rostered day with a start time
 * nobody promised them. An earlier cut inferred FIXED from a shift that
 * happened to carry expectations, which is a smaller version of the same lie:
 * it draws a target the member never agreed to and calls anything past it
 * overtime.
 *
 * What the server SAYS always wins. It just does not say yet — §2 asks for
 * `scheduleType` and `monthlyHourBudget` in the login payload beside
 * `allowRemote`, which is a server change.
 */
export function scheduleFor(declared: string | null | undefined): ScheduleKind {
  if (declared === 'FIXED' || declared === 'FLEXIBLE' || declared === 'NONE') return declared;
  return 'NONE';
}

export { ShiftState, MIN, progressFor };
