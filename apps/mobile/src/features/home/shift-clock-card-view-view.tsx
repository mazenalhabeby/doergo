'use client';

import { shiftCaption } from './shift-clock/shift-caption';
import { formatDuration } from '@hbcfield/shared/client';
import type { useShiftClockCardView } from './use-shift-clock-card-view';
import type { ShiftClockCardView } from './shift-clock-card';

/** What ShiftClockCardView works out after its early returns, moved here unchanged; called from the same place. */
export function ShiftClockCardViewView({
  noShift,
  onAskMoreTime,
  user,
  t,
  c,
  clockOf,
  totals,
  st,
  clockIn,
  busy,
}: {
  noShift: Parameters<typeof ShiftClockCardView>[0]['noShift'];
  onAskMoreTime: Parameters<typeof ShiftClockCardView>[0]['onAskMoreTime'];
  user: ReturnType<typeof useShiftClockCardView>['user'];
  t: ReturnType<typeof useShiftClockCardView>['t'];
  c: ReturnType<typeof useShiftClockCardView>['c'];
  clockOf: ReturnType<typeof useShiftClockCardView>['clockOf'];
  totals: ReturnType<typeof useShiftClockCardView>['totals'];
  st: ReturnType<typeof useShiftClockCardView>['st'];
  clockIn: ReturnType<typeof useShiftClockCardView>['clockIn'];
  busy: ReturnType<typeof useShiftClockCardView>['busy'];
}) {
  /*
    This week so far, with the shift that is running now added on. The totals
    hook only counts CLOSED entries — a running shift is not a total yet — and
    a strip reading `This week 15h 52m` that ignores the hours being worked
    while somebody looks at it would be wrong in the one way they would notice.
  */
  const weekSoFar =
    totals.weekMinutes === null ? null : totals.weekMinutes + (st.countedMinutes ?? 0);

  const live = st.kind === 'working' || st.kind === 'restOverdue';
  const resting = st.kind === 'resting';
  const working = busy || clockIn.isBusy;

  const eyebrow =
    st.kind === 'unconfirmed' ? t('shiftClock.needsYourTime', { defaultValue: 'NEEDS YOUR TIME' })
    : resting ? t('shiftClock.onARest', { defaultValue: 'ON A REST' })
    : live ? t('shiftClock.onTheClock', { defaultValue: 'ON THE CLOCK' })
    : st.kind === 'done' ? t('shiftClock.doneForToday', { defaultValue: 'DONE FOR TODAY' })
    : t('shiftClock.notOnTheClock', { defaultValue: 'NOT ON THE CLOCK' });

  const eyebrowTone =
    st.kind === 'unconfirmed' ? ('critical' as const)
    : resting ? ('warn' as const)
    : ('onGlass' as const);

  const dotColor =
    st.kind === 'unconfirmed' ? c.critical
    : resting ? c.warn
    : live ? c.accent
    /* ⚠️ ① takes `lineField` — the dot is present and quiet, so the row does
       not change shape when it lights up. */
    : c.lineField;

  const caption = shiftCaption(st, { t, clockOf, monthlyHourBudget: user?.monthlyHourBudget, live, resting });
  // Off the clock only: what the workspace they are at still allows today, or that it allows nothing more.
  const offClock = !live && !resting && st.kind !== 'unconfirmed';
  const noShiftLine = offClock && noShift?.allowance.kind === 'limited'
    ? t('shiftClock.noShiftLeft', {
        location: noShift.location.name,
        left: formatDuration(noShift.allowance.remainingMinutes),
        defaultValue: 'At {{location}} · no shift · {{left}} left today',
      })
    : null;
  const askMore = offClock && !!onAskMoreTime && noShift?.allowance.kind === 'refused' && noShift.allowance.reason === 'NO_HOURS_LEFT';

  return {
    weekSoFar,
    live,
    resting,
    working,
    eyebrow,
    eyebrowTone,
    dotColor,
    caption,
    noShiftLine,
    askMore,
  };
}
