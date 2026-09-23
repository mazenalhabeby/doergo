import { computeCountedTime, parseBreakPlan, outstandingBreaks, type BreakPlanItem } from '@hbcfield/shared/client';
import type { AttendanceStatus, BreakStatus, TimeEntry } from '@hbcfield/shared/client';

/**
 * Which of the eight the shift card is in, decided once.
 *
 * Kept out of the component because the card is the most-used surface in the
 * app and its states are the kind of thing that grows a ninth branch inside a
 * JSX conditional at six in the evening. Everything here is pure.
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
  /** ⑥ Clocked out, finished today. The hero is what they earned. */
  | 'done'
  /** ⑦ A shift left open, closed at a temporary time, waiting for the real one. */
  | 'unconfirmed';

export type ScheduleKind = 'FIXED' | 'FLEXIBLE' | 'NONE';

export interface ShiftState {
  kind: ShiftStateKind;
  /** ⑤ Not a state of its own — a chip on ②. The clock-in is in the outbox. */
  queued: boolean;
  /** Minutes the hero counts, or null when the hero is a clock time instead. */
  minutes: number | null;
  /** A wall-clock hero — the rostered start, when that is what is promised. */
  at: Date | null;
  /** Counted so far today. ⚠️ Never called "paid". */
  countedMinutes: number | null;
  workspace: string | null;
  /** The next planned rest, if the shift has a plan. */
  nextRest: BreakPlanItem | null;
  /** How many minutes ago the rest fell due. Positive only in `restOverdue`. */
  restOverdueBy: number;
  /** Progress against what this person is measured against, or null for NONE. */
  progress: { done: number; target: number } | null;
}

const MIN = 60_000;

/**
 * ⚠️ NONE RENDERS NO PROGRESS TRACK. A bar with no target invents one, and the
 * column default is NONE — so the unconfigured majority would get an invented
 * target if this returned anything but null.
 */
function progressFor(
  schedule: ScheduleKind,
  entry: TimeEntry | null,
  elapsed: number,
  monthMinutes: number | null,
  budgetHours: number | null,
): ShiftState['progress'] {
  if (schedule === 'FIXED') {
    const start = entry?.expectedClockInAt ? new Date(entry.expectedClockInAt) : null;
    const end = entry?.expectedClockOutAt ? new Date(entry.expectedClockOutAt) : null;
    if (!start || !end) return null;
    const target = Math.round((end.getTime() - start.getTime()) / MIN);
    return target > 0 ? { done: elapsed, target } : null;
  }
  if (schedule === 'FLEXIBLE') {
    if (!budgetHours || budgetHours <= 0 || monthMinutes === null) return null;
    return { done: monthMinutes, target: Math.round(budgetHours * 60) };
  }
  return null;
}

export function readShiftState(input: {
  status: AttendanceStatus | null;
  breaks: BreakStatus | null;
  schedule: ScheduleKind;
  monthlyHourBudget?: number | null;
  /** Month-to-date counted minutes, for FLEXIBLE. Null when not asked for. */
  monthMinutes?: number | null;
  /** Something about this shift is still in the outbox. */
  queued?: boolean;
  now?: Date;
}): ShiftState {
  const now = input.now ?? new Date();
  const entry = input.status?.currentEntry ?? null;
  const queued = !!input.queued;

  const base: ShiftState = {
    kind: 'before',
    queued,
    minutes: null,
    at: null,
    countedMinutes: null,
    workspace: entry?.location?.name ?? null,
    nextRest: null,
    restOverdueBy: 0,
    progress: null,
  };

  /*
    ⑦ first, and ahead of everything.

    A shift left running and auto-closed at a temporary time cannot be approved
    until the member says when they actually left, and NO widget in the
    catalogue of twenty-seven claims this field. Until one does it lands here,
    because leaving it nowhere is how a shift sits unapprovable for a month.
  */
  const un = input.status?.unconfirmedClockOut;
  if (un && !input.status?.isClockedIn) {
    return {
      ...base,
      kind: 'unconfirmed',
      workspace: un.location?.name ?? null,
      at: un.clockOutAt ? new Date(un.clockOutAt) : null,
    };
  }

  if (!input.status?.isClockedIn || !entry) {
    /*
      ① or ⑥ — and they are different states, though §3.1's single line
      ("Not on the clock") covers both. The hero in ⑥ is what they EARNED.
    */
    return { ...base, kind: 'before' };
  }

  const clockIn = new Date(entry.clockInAt);
  const elapsed = Math.max(0, Math.floor((now.getTime() - clockIn.getTime()) / MIN));

  /*
    ⚠️ Elapsed is DERIVED FROM `clockInAt`, never counted up from mount. A
    phone that slept through lunch must show the right number the instant it
    wakes, and a ticking counter seeded at mount shows how long the screen has
    been open.
  */
  const counted = computeCountedTime({
    clockInAt: clockIn,
    clockOutAt: null,
    expectedStartAt: entry.expectedClockInAt ? new Date(entry.expectedClockInAt) : null,
    expectedEndAt: entry.expectedClockOutAt ? new Date(entry.expectedClockOutAt) : null,
    unpaidBreakMinutes: entry.unpaidBreakMinutes ?? 0,
  });
  const countedSoFar = Math.max(
    0,
    Math.floor((now.getTime() - counted.countedStartAt.getTime()) / MIN) - (entry.unpaidBreakMinutes ?? 0),
  );

  const plan = parseBreakPlan(entry.breakPlan);
  const due = outstandingBreaks(plan)
    .slice()
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const nextRest = due[0] ?? null;
  const overdueBy = nextRest
    ? Math.floor((now.getTime() - new Date(nextRest.dueAt).getTime()) / MIN)
    : 0;

  const progress = progressFor(
    input.schedule,
    entry,
    input.schedule === 'FLEXIBLE' ? (input.monthMinutes ?? 0) : elapsed,
    input.monthMinutes ?? null,
    input.monthlyHourBudget ?? null,
  );

  // ③ — on a rest. The counted figure freezes and the card says so.
  if (input.breaks?.isOnBreak && input.breaks.currentBreak) {
    const started = new Date(input.breaks.currentBreak.startedAt);
    return {
      ...base,
      kind: 'resting',
      minutes: Math.max(0, Math.floor((now.getTime() - started.getTime()) / MIN)),
      countedMinutes: countedSoFar,
      nextRest,
      progress,
    };
  }

  // ④ — the only place in the catalogue where the filled disc is not the
  // obvious one. Clock out stays one tap away; it is simply not what is being
  // offered.
  if (nextRest && overdueBy > 0) {
    return {
      ...base,
      kind: 'restOverdue',
      minutes: elapsed,
      countedMinutes: countedSoFar,
      nextRest,
      restOverdueBy: overdueBy,
      progress,
    };
  }

  return { ...base, kind: 'working', minutes: elapsed, countedMinutes: countedSoFar, nextRest, progress };
}

/** `3` `h` `12` `m` — the hero, set like an amount. */
export function heroParts(minutes: number): { value: string; unit: string }[] {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return [{ value: String(m), unit: 'm' }];
  return [{ value: String(h), unit: 'h' }, { value: String(m).padStart(2, '0'), unit: 'm' }];
}
