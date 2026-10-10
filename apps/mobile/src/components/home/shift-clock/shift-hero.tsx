import React from 'react';
import { useTranslation } from 'react-i18next';
import { AText, Hero } from '../../amazen';
import { heroParts, type readShiftState } from '../shift-state';

type ShiftState = ReturnType<typeof readShiftState>;

/** The figure, and what it is measured against. */
export function ShiftHero({ st, resting, clockOf }: {
  st: ShiftState;
  resting: boolean;
  clockOf: (d: string | Date) => string;
}) {
  const { t } = useTranslation();
  if (st.kind === 'unconfirmed') {
    return <AText variant="h2" tone="strong">{t('shiftClock.whenDidYouLeave', { defaultValue: 'When did you leave?' })}</AText>;
  }
  /*
    ① THE HERO IS THE NEXT THING, NOT A ZERO. A 64pt `0` is the mistake the
    old dashboard made with `0/12`, and it is the same mistake at a larger
    size: a member reads the biggest thing on the card first, and being told
    they have done nothing is not what they opened the app for.

    ⚠️ AND IT IS SET LIKE AN AMOUNT IN EVERY CASE — integer at display size,
    unit at decimal. `07:00` is `07` + `:00`, not a string; `84h of 160h` is
    `84` + `h` with the rest in the caption, because the budget is context
    and the figure is the answer.
  */
  if (st.kind === 'before' && st.at) {
    /*
      `07` + `:00` — set like an amount, so the integer carries the weight.
      Split on the separator the member's OWN format produced rather than on
      a hard-coded colon, because a 12-hour clock brings `AM` with it.
    */
    const face = clockOf(st.at);
    const cut = face.indexOf(':');
    return (
      <Hero
        parts={[{ value: cut > 0 ? face.slice(0, cut) : face, unit: cut > 0 ? face.slice(cut) : '' }]}
        tone="strong"
        unitTone="onGlass"
      />
    );
  }
  if (st.minutes !== null) {
    return (
      <Hero
        parts={heroParts(st.minutes)}
        tone={resting ? 'warn' : 'strong'}
        unitTone={resting ? 'warn' : 'onGlass'}
      />
    );
  }
  return <AText variant="h2" tone="strong">{t('shiftClock.readyToStart', { defaultValue: 'Ready to start' })}</AText>;
}
