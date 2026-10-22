import type { TFunction } from 'i18next';
import { weekdayName } from '@/lib/app-dates';
import type { readShiftState } from '../shift-state';
import { formatDuration } from '@hbcfield/shared/client';

type ShiftState = ReturnType<typeof readShiftState>;

/** `{workspace} · counted {n} · rest due {time}` — and never the word paid. */
export function shiftCaption(st: ShiftState, ctx: {
  t: TFunction;
  /** The member's own clock — `useTimeFormat().formatTime`. */
  clockOf: (d: string | Date) => string;
  monthlyHourBudget?: number | null;
  live: boolean;
  resting: boolean;
}): string {
  const { t, clockOf, monthlyHourBudget, live, resting } = ctx;
  if (st.kind === 'unconfirmed') {
    return t('shiftClock.leftRunning', {
      workspace: st.workspace ?? '',
      time: st.at ? clockOf(st.at) : '',
      defaultValue: `${st.workspace ?? ''}. We closed it at ${st.at ? clockOf(st.at) : ''} because it was left running.`,
    });
  }
  if (st.kind === 'done' && st.finished) {
    return [
      st.workspace,
      `${clockOf(st.finished.from)} → ${clockOf(st.finished.to)}`,
      /*
        ⚠️ THREE OUTCOMES, NOT TWO. A REJECTED entry is neither waiting nor
        approved; saying `counted and approved` under it was a false
        statement about the one thing the member cares about, so
        REJECTED has its own sentence.
      */
      st.finished.awaitingApproval
        ? t('shiftClock.countedWaiting', { defaultValue: 'counted, waiting for approval' })
        : st.finished.approved
          ? t('shiftClock.countedApproved', { defaultValue: 'counted and approved' })
          : st.finished.rejected
            ? t('shiftClock.countedRejected', { defaultValue: 'not approved' })
            : null,
    ].filter(Boolean).join(' · ');
  }
  /*
    ① — THREE DIFFERENT SENTENCES, BECAUSE THE THREE ASK DIFFERENT
    QUESTIONS. FIXED wants to know whether it is on time, FLEXIBLE whether it
    is on track, NONE what it has done. One caption for all three would have
    to be vague enough to be true of each, which is a sentence that answers
    nobody.
  */
  // The arrival card: already at the shift's workspace — say where, and when it starts.
  if (st.kind === 'before' && st.arrived && st.at) {
    return t('shiftClock.arrivedStartsAt', {
      workspace: st.workspace ?? '',
      time: clockOf(st.at),
      defaultValue: `You're at ${st.workspace ?? ''} · your shift starts at ${clockOf(st.at)}`,
    });
  }
  if (st.kind === 'before' && st.startsInMinutes !== null && st.startsInMinutes > 0) {
    return [
      st.workspace,
      t('shiftClock.startsIn', {
        count: st.startsInMinutes,
        defaultValue_one: 'your shift starts in a minute',
        defaultValue_other: `your shift starts in ${st.startsInMinutes} minutes`,
      }),
    ].filter(Boolean).join(' · ');
  }
  if (st.kind === 'before' && st.schedule === 'FLEXIBLE' && st.minutes !== null) {
    return [
      monthlyHourBudget
        ? t('shiftClock.ofBudget', {
            hours: monthlyHourBudget,
            defaultValue: `of ${monthlyHourBudget}h this month`,
          })
        : t('shiftClock.thisMonth', { defaultValue: 'this month' }),
      st.workingDaysLeft !== null
        ? t('shiftClock.daysLeft', {
            count: st.workingDaysLeft,
            defaultValue_one: '1 working day left',
            defaultValue_other: `${st.workingDaysLeft} working days left`,
          })
        : null,
    ].filter(Boolean).join(' · ');
  }
  if (st.kind === 'before' && st.schedule === 'NONE' && st.minutes !== null) {
    return [
      t('shiftClock.workedThisWeek', { defaultValue: 'worked this week' }),
      st.lastInOn
        ? t('shiftClock.lastInOn', {
            day: weekdayName(st.lastInOn),
            defaultValue: `last in on ${weekdayName(st.lastInOn)}`,
          })
        : null,
    ].filter(Boolean).join(' · ');
  }
  if (st.queued && live) {
    return [st.workspace, t('shiftClock.waitingToReach', { defaultValue: 'waiting to reach the office' })]
      .filter(Boolean).join(' · ');
  }
  return [
    /*
      ③ `Back at 11:24` replaces the workspace, because during a rest the
      question is not where you are — it is when you are due back. Falls back
      to the workspace when the rest was taken outside any plan, where nobody
      said how long it is and a made-up time would be a promise.
    */
    resting && st.backAt
      ? t('shiftClock.backAt', {
          time: clockOf(st.backAt),
          defaultValue: `Back at ${clockOf(st.backAt)}`,
        })
      : st.workspace,
    st.countedMinutes !== null
      ? resting && !st.restCounts
        /*
          ⚠️ ③ FREEZES THE COUNTED FIGURE AND SAYS SO. A rest that silently
          keeps counting is the bug this sentence prevents: the number stops
          moving and a member who does not know why assumes the app hung.
        */
        ? t('shiftClock.countedFrozen', {
            counted: formatDuration(st.countedMinutes),
            defaultValue: `counted ${formatDuration(st.countedMinutes)}, not counting now`,
          })
        : t('shiftClock.counted', {
            counted: formatDuration(st.countedMinutes),
            defaultValue: `counted ${formatDuration(st.countedMinutes)}`,
          })
      : null,
    st.nextRest && st.restOverdueBy <= 0
      ? t('shiftClock.restDue', {
          time: clockOf(st.nextRest.dueAt),
          defaultValue: `rest due ${clockOf(st.nextRest.dueAt)}`,
        })
      : null,
  ].filter(Boolean).join(' · ');
}
