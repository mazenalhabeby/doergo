import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { monthName } from '../../../lib/app-dates';
import { AText, Eyebrow } from '../../amazen';
import { targetLabel, type readShiftState } from '../shift-state';
import { formatDuration } from '@hbcfield/shared/client';

type ShiftState = ReturnType<typeof readShiftState>;

/**
 * Under the hero: the labelled track against the promise (FIXED / FLEXIBLE),
 * or — NONE on the clock — this week's figure. Renders what it is given and
 * decides nothing; `st.progress` is null for NONE by construction.
 */
export function ShiftProgress({ st, live, resting, now, weekSoFar }: {
  st: ShiftState;
  live: boolean;
  resting: boolean;
  now: Date;
  weekSoFar: number | null;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <>
      {/*
        ⚠️ `NONE` RENDERS NO TRACK AT ALL (rule 6). A bar with no target
        invents one, and NONE is the column's default — so the unconfigured
        majority would be measured against a number nobody promised them.
        `st.progress` is null for NONE by construction; this renders what it
        is given and decides nothing.

        ⚠️ AND THE TRACK IS LABELLED. A bare bar says "some of something";
        `TODAY · 3h 12m of 8h` says which clock it is measuring, which is
        the whole difference between FIXED and FLEXIBLE — the same bar
        against a different promise.
      */}
      {st.progress ? (
        <View style={{ marginTop: amazen.space(4) }}>
          <View
            style={{ height: 4, borderRadius: 2, backgroundColor: c.tile, overflow: 'hidden' }}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: st.progress.target, now: st.progress.done }}
          >
            <View
              style={{
                width: `${st.progress.past ? 100 : Math.min(100, Math.round((st.progress.done / st.progress.target) * 100))}%`,
                height: '100%',
                /* ⚠️ Past the target is `warn`, not `crit` — overtime is
                   owed, not wrong. It means three different things per
                   schedule kind; the colour only says "past it". */
                backgroundColor: st.progress.past || st.progress.done > st.progress.target ? c.warn : c.accent,
              }}
            />
          </View>
          {live || resting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: amazen.space(2) }}>
              <Eyebrow tone="onGlass">
                {st.schedule === 'FLEXIBLE'
                  ? monthName(now)
                  : t('shiftClock.today', { defaultValue: 'TODAY' })}
              </Eyebrow>
              <View style={{ flex: 1 }} />
              <AText variant="caption" tone="onGlass" numeric>
                {t('shiftClock.ofTarget', {
                  done: formatDuration(st.progress.done),
                  target: targetLabel(st.progress.target),
                  defaultValue: `${formatDuration(st.progress.done)} of ${targetLabel(st.progress.target)}`,
                })}
              </AText>
            </View>
          ) : null}
        </View>
      ) : null}

      {/*
        ⚠️ `NONE` ON THE CLOCK GETS A FIGURE, NOT A BAR. Nothing is
        promised, so there is nothing to draw a track against — but what
        they have worked this week is still a fact, and it is the one they
        would otherwise have to leave the card to find.
      */}
      {(live || resting) && st.schedule === 'NONE' && weekSoFar !== null ? (
        <View
          style={{
            flexDirection: 'row', alignItems: 'center',
            marginTop: amazen.space(4),
            backgroundColor: c.sunken,
            borderRadius: amazen.radius.field,
            paddingVertical: amazen.space(2.5),
            paddingHorizontal: amazen.space(3.5),
          }}
        >
          <AText variant="caption" tone="onGlass">
            {t('shiftClock.thisWeek', { defaultValue: 'This week' })}
          </AText>
          <View style={{ flex: 1 }} />
          <AText variant="body" tone="strong" numeric>{formatDuration(weekSoFar)}</AText>
        </View>
      ) : null}
    </>
  );
}
