import { computeCountedTime, parseBreakPlan, outstandingBreaks, type BreakPlanItem } from '@hbcfield/shared/client';
import type { AttendanceStatus, BreakStatus, TimeEntry } from '@hbcfield/shared/client';

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

export interface ShiftState {
  kind: ShiftStateKind;
  /** ⑤ Not a state of its own — a chip on ②. The clock-in is in the outbox. */
  queued: boolean;
  /** Minutes the hero counts, or null when the hero is not a duration. */
  minutes: number | null;
  /** A wall-clock hero — the rostered start, when that is what is promised. */
  at: Date | null;
  /** Counted so far. ⚠️ Never called "paid". */
  countedMinutes: number | null;
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
  /** ⑥ — the shift that just ended, for `06:45 → 15:00`. */
  finished: { from: Date; to: Date; awaitingApproval: boolean } | null;
  /** Progress against what this person is measured against, or null for NONE. */
  progress: { done: number; target: number } | null;
  /** Which question the hero answers, so the card can label it. */
  schedule: ScheduleKind;
}

const MIN = 60_000;

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
): ShiftState['progress'] {
  if (schedule === 'FIXED') {
    const start = entry?.expectedClockInAt ? new Date(entry.expectedClockInAt) : null;
    const end = entry?.expectedClockOutAt ? new Date(entry.expectedClockOutAt) : null;
    if (!start || !end) return null;
    const target = Math.round((end.getTime() - start.getTime()) / MIN);
    return target > 0 ? { done: todayMinutes, target } : null;
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
 * ⚠️ READ THE DATA WHEN THE SERVER HAS NOT SAID. See `ScheduleKind` — a shift
 * the roster gave both a start and an end to is a FIXED one whatever the login
 * payload left out, and everything else is NONE. The one thing this must never
 * do is answer FIXED for somebody with no roster, because that is a bar with
 * no target.
 */
export function scheduleFor(
  declared: string | null | undefined,
  entry: TimeEntry | null | undefined,
): ScheduleKind {
  if (declared === 'FIXED' || declared === 'FLEXIBLE' || declared === 'NONE') return declared;
  const rostered = !!entry?.expectedClockInAt && !!entry?.expectedClockOutAt && !entry?.endIsDailyLimit;
  return rostered ? 'FIXED' : 'NONE';
}

export function readShiftState(input: {
  status: AttendanceStatus | null;
  breaks: BreakStatus | null;
  /** What the login payload said, or nothing — see `scheduleFor`. */
  declaredSchedule?: string | null;
  monthlyHourBudget?: number | null;
  /** Month-to-date counted minutes, for FLEXIBLE. Null when not known yet. */
  monthMinutes?: number | null;
  /** This week's counted minutes — NONE's hero when clocked out. */
  weekMinutes?: number | null;
  /** The shift that ended today, if one did. Drives ⑥. */
  lastToday?: TimeEntry | null;
  /** Something about this shift is still in the outbox. */
  queued?: boolean;
  now?: Date;
}): ShiftState {
  const now = input.now ?? new Date();
  const entry = input.status?.currentEntry ?? null;
  const schedule = scheduleFor(input.declaredSchedule, entry ?? input.lastToday ?? null);

  const base: ShiftState = {
    kind: 'before',
    queued: !!input.queued,
    minutes: null,
    at: null,
    countedMinutes: null,
    workspace: entry?.location?.name ?? null,
    nextRest: null,
    restOverdueBy: 0,
    backAt: null,
    startsInMinutes: null,
    finished: null,
    progress: null,
    schedule,
  };

  /*
    ⑦ FIRST, AND AHEAD OF EVERYTHING.

    A shift left running and auto-closed at a temporary time cannot be approved
    until the member says when they actually left, and ⚠️ NO OTHER WIDGET IN
    THE CATALOGUE CLAIMS `unconfirmedClockOut`. Until one does it lands here,
    because leaving it nowhere is how a shift sits unapprovable for a month
    with nothing on any screen asking.
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
      ① AND ⑥ ARE DIFFERENT STATES AND USED TO BE ONE.

      Both are "clocked out", and collapsing them cost the card its answer at
      the two moments it is most read: before a shift, the hero is the rostered
      START — the next thing, ⚠️ never a zero, which is the mistake the old
      dashboard made with `0/12`. After it, the hero is what they EARNED.
    */
    const last = input.lastToday ?? null;
    if (last?.clockOutAt) {
      const counted = last.paidMinutes ?? last.totalMinutes ?? 0;
      return {
        ...base,
        kind: 'done',
        minutes: counted,
        countedMinutes: counted,
        workspace: last.location?.name ?? null,
        finished: {
          from: new Date(last.clockInAt),
          to: new Date(last.clockOutAt),
          awaitingApproval: last.approvalStatus === 'PENDING',
        },
      };
    }

    /*
      ① — and the hero is whatever this person is measured against. FIXED gets
      the rostered start, FLEXIBLE the month against its budget, NONE the
      week's total, because nothing is promised and a total is still a fact.
    */
    const nextStart = input.status?.currentEntry?.expectedClockInAt ?? null;
    if (schedule === 'FIXED' && nextStart) {
      const at = new Date(nextStart);
      return {
        ...base,
        at,
        startsInMinutes: Math.round((at.getTime() - now.getTime()) / MIN),
      };
    }
    /*
      ⚠️ AND A TOTAL OF ZERO IS NOT A HERO — IT IS THE `0/12` BUG AGAIN.

      §2 says FLEXIBLE's hero is the month and NONE's is the week, and both are
      legitimately zero on a Monday morning. Drawing that renders a 64pt `0`,
      which is the exact mistake §1 forbids: the member reads the biggest thing
      on the card first, and being told they have done nothing is not what they
      opened the app for. With no figure worth showing the card says the
      sentence instead.
    */
    if (schedule === 'FLEXIBLE' && !!input.monthMinutes) {
      return {
        ...base,
        minutes: input.monthMinutes,
        progress: progressFor('FLEXIBLE', null, 0, input.monthMinutes, input.monthlyHourBudget ?? null),
      };
    }
    if (schedule === 'NONE' && !!input.weekMinutes) {
      return { ...base, minutes: input.weekMinutes };
    }
    return base;
  }

  const clockIn = new Date(entry.clockInAt);
  /*
    ⚠️ ELAPSED IS DERIVED FROM `clockInAt`, NEVER COUNTED UP FROM MOUNT —
    rule 5. A phone that slept through lunch must show the right number the
    instant it wakes; a counter seeded at mount shows how long the screen has
    been open, which is a different and useless number.
  */
  const elapsed = Math.max(0, Math.floor((now.getTime() - clockIn.getTime()) / MIN));

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
    schedule,
    entry,
    countedSoFar,
    input.monthMinutes ?? null,
    input.monthlyHourBudget ?? null,
  );

  /*
    ③ — ON A REST.

    ⚠️ THE COUNTED FIGURE FREEZES, AND THE CARD SAYS SO. A rest that silently
    keeps counting is the bug that sentence prevents: the number stops moving
    and a member who does not know why assumes the app has hung.

    The frozen figure is the counted total AT THE MOMENT THE REST STARTED, not
    now — reading it at `now` would keep it creeping while the caption insists
    it has stopped.
  */
  if (input.breaks?.isOnBreak && input.breaks.currentBreak) {
    const started = new Date(input.breaks.currentBreak.startedAt);
    const current = input.breaks.currentBreak;
    const ruleId = (current as { ruleId?: string | null }).ruleId ?? null;
    const planned = plan.find((b) => b.ruleId === ruleId) ?? null;
    const backAt = planned?.durationMinutes
      ? new Date(started.getTime() + planned.durationMinutes * MIN)
      : null;
    const frozen = Math.max(
      0,
      Math.floor((started.getTime() - counted.countedStartAt.getTime()) / MIN) - (entry.unpaidBreakMinutes ?? 0),
    );
    return {
      ...base,
      kind: 'resting',
      minutes: Math.max(0, Math.floor((now.getTime() - started.getTime()) / MIN)),
      at: started,
      backAt,
      countedMinutes: frozen,
      nextRest,
      progress,
    };
  }

  /*
    ④ — ⚠️ THE ONLY PLACE IN THE CATALOGUE WHERE THE FILLED DISC IS NOT THE
    OBVIOUS ONE. Clock out is still one tap away; it is simply not what is
    being offered. The card does not decide that here — it reports that the
    rest is overdue, and the disc row reads it.
  */
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

/**
 * `3` `h` `12` `m` — THE HERO IS SET LIKE AN AMOUNT.
 *
 * Integer at display size, unit at decimal size: the same rule the system uses
 * for money, and the reason `3h 12m` at one size reads as a string of
 * characters while this reads as a quantity.
 */
export function heroParts(minutes: number): { value: string; unit: string }[] {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return [{ value: String(m), unit: 'm' }];
  return [{ value: String(h), unit: 'h' }, { value: String(m).padStart(2, '0'), unit: 'm' }];
}

/** `84` `h` `of 160h` — FLEXIBLE's hero, a month against its budget. */
export function budgetParts(doneMinutes: number, targetHours: number): { value: string; unit: string }[] {
  return [
    { value: String(Math.floor(doneMinutes / 60)), unit: 'h' },
    { value: '', unit: `of ${targetHours}h` },
  ];
}
