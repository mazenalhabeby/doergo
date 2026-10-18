/** Which state the shift card is in, decided once (moved here unchanged) */
import {
  computeCountedTime,
  outstandingBreaks,
  parseBreakPlan,
  type AttendanceStatus,
  type BreakStatus,
  type TimeEntry,
} from '@hbcfield/shared/client';
import { MIN, progressFor, scheduleFor, type ShiftState, workingDaysLeftIn } from './kinds';

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
    /*
      ⚠️ THE PLANNED SHIFT, NOT THE RUNNING ENTRY. This read
      `currentEntry.expectedClockInAt` — which does not exist before clock-in,
      the only moment this branch runs — so "starts in N minutes" never showed.
      The server now sends the next planned shift (rota or weekly schedule)
      with the status. And a planned shift IS the roster: shown whatever the
      declared schedule says (most rota workers are declared NONE).
    */
    const planned = input.status?.nextShift ?? null;
    if (planned) {
      const at = new Date(planned.startAt);
      return {
        ...base,
        at,
        workspace: planned.spaceName ?? base.workspace,
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
    ? Math.floor((now.getTime() - Math.max(new Date(nextRest.dueAt).getTime(), clockIn.getTime())) / MIN)
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
    const backAt = planned?.durationMinutes ? new Date(started.getTime() + planned.durationMinutes * MIN) : null;
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
    const restCounts = (current as { isPaid?: boolean | null }).isPaid ?? planned?.isPaid ?? false;
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
