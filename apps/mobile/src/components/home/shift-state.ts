import { computeCountedTime, parseBreakPlan, outstandingBreaks, type BreakPlanItem, formatDuration } from '@hbcfield/shared/client';
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
  /** When they last clocked in at all — ① NONE's `last in on Friday`. */
  lastIn?: Date | null;
  /** Something about this shift is still in the outbox. */
  queued?: boolean;
  now?: Date;
}): ShiftState {
  const now = input.now ?? new Date();
  const entry = input.status?.currentEntry ?? null;
  const schedule = scheduleFor(input.declaredSchedule);

  const base: ShiftState = {
    kind: 'before',
    queued: !!input.queued,
    minutes: null,
    at: null,
    countedMinutes: null,
    restCounts: false,
    workspace: entry?.location?.name ?? null,
    nextRest: null,
    restOverdueBy: 0,
    backAt: null,
    startsInMinutes: null,
    workingDaysLeft: null,
    lastInOn: null,
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
          approved: last.approvalStatus === 'APPROVED' || last.approvalStatus === 'AUTO',
          rejected: last.approvalStatus === 'REJECTED',
        },
      };
    }

    /*
      ① — AND THE HERO IS WHATEVER THIS PERSON IS MEASURED AGAINST.

      FIXED gets the rostered start, because the question is *am I on time*.
      FLEXIBLE gets the month against its budget, because the question is *am I
      on track*. NONE gets what they have actually worked, because nothing is
      promised in either direction and a record is still a fact.
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
    if (schedule === 'FLEXIBLE' && !!input.monthMinutes) {
      return {
        ...base,
        minutes: input.monthMinutes,
        workingDaysLeft: workingDaysLeftIn(now),
        progress: progressFor('FLEXIBLE', null, 0, input.monthMinutes, input.monthlyHourBudget ?? null),
      };
    }
    if (schedule === 'NONE' && !!input.weekMinutes) {
      return {
        ...base,
        minutes: input.weekMinutes,
        lastInOn: input.lastIn ?? null,
      };
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
  /*
    ⚠️ OVERDUE SINCE IT FELL DUE *ON THE CLOCK*, NEVER BEFORE IT.

    The plan's `dueAt` is laid out from the ROSTERED start, so somebody who
    arrives two hours late clocks in to a rest whose `dueAt` is already behind
    them — and the card greeted them, at the moment of clocking in, with `Your
    rest was due 128 minutes ago` (seen live on a night shift rostered 21:16,
    clocked in 23:26). They were not here; nothing was overdue. The server's
    own reminder agrees: it schedules the prompt from the clock-in, not from
    the stale `dueAt`.
  */
  const overdueBy = nextRest
    ? Math.floor(
        (now.getTime() - Math.max(new Date(nextRest.dueAt).getTime(), clockIn.getTime())) / MIN,
      )
    : 0;

  const progress = progressFor(
    schedule,
    entry,
    countedSoFar,
    input.monthMinutes ?? null,
    input.monthlyHourBudget ?? null,
    now,
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
    /*
      A counted rest (`isPaid` on the break, or on the rule it satisfies) does
      not stop the clock — see `restCounts`. Unknown is read as NOT counting:
      a rest started offline carries no answer yet, and freezing is the
      claim that can only under-state.
    */
    const restCounts =
      (current as { isPaid?: boolean | null }).isPaid ?? planned?.isPaid ?? false;
    return {
      ...base,
      kind: 'resting',
      minutes: Math.max(0, Math.floor((now.getTime() - started.getTime()) / MIN)),
      at: started,
      backAt,
      countedMinutes: restCounts ? countedSoFar : frozen,
      restCounts: restCounts === true,
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

/**
 * `8h`, `7h 30m` — what a target reads as.
 *
 * ⚠️ NOT `Math.round(minutes / 60)`. A 7h30 shift read `of 8h`, and a 6h20
 * one `of 6h`: the label disagreed with the bar drawn above it, and with the
 * clock-out sheet's own target, by up to half an hour.
 */
export function targetLabel(minutes: number): string {
  return formatDuration(minutes);
}

/** `84` `h` `of 160h` — FLEXIBLE's hero, a month against its budget. */
export function budgetParts(doneMinutes: number, targetHours: number): { value: string; unit: string }[] {
  return [
    { value: String(Math.floor(doneMinutes / 60)), unit: 'h' },
    { value: '', unit: `of ${targetHours}h` },
  ];
}

/**
 * When the totals must be asked again: on and off the clock, a new entry — and
 * ⚠️ when a queued shift change finishes sending. A clock-out is optimistic:
 * the status flips at the tap and the history is asked at once, BEFORE the
 * queued clock-out reached the server, so ⑥ showed the shift before this one
 * with nothing to ask again once it landed. ONE key for the Time page and the
 * home card — they were two copies, and fixing one left the other wrong.
 */
export function totalsRevision(
  status: { isClockedIn?: boolean; currentEntry?: { id?: string } | null } | null | undefined,
  pendingSync: boolean,
): string {
  return `${status?.isClockedIn ? '1' : '0'}:${status?.currentEntry?.id ?? ''}:${pendingSync ? 'q' : ''}`;
}
