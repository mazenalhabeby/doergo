import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { AText } from './amazen';
import { readClockOut, type ClockOutShift } from '../features/home/clock-out-state';
import { formatDistance } from '../lib/distance';
import { formatDuration } from '@hbcfield/shared/client';
import { Row } from '../features/time/clock-out-sheet-shared';

/** Receipt, moved here unchanged out of clock-out-sheet.tsx. */
/**
 * THE RECEIPT.
 *
 * ⚠️ MONO, RIGHT-ALIGNED, ONE RULE ABOVE THE TOTAL. A shift ends in a record;
 * setting it like a statement is what makes it feel finished, and it is why
 * the figures line up as digits rather than as prose.
 */
export function Receipt({
  view,
  shift,
  clockOf,
}: {
  view: ReturnType<typeof readClockOut>;
  shift: ClockOutShift;
  clockOf: (d: Date) => string;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;

  return (
    <View
      style={{
        marginTop: amazen.space(4),
        backgroundColor: c.sunken,
        borderRadius: 20,
        paddingHorizontal: amazen.space(4),
        paddingVertical: amazen.space(3),
      }}
    >
      <Row label={t('shiftEnd.clockedIn', { defaultValue: 'Clocked in' })} value={clockOf(shift.clockInAt)} />
      {view.bar.rest > 0 ? (
        <Row label={t('shiftEnd.rest', { defaultValue: 'Rest' })} value={`− ${formatDuration(view.bar.rest)}`} />
      ) : null}

      {view.face === 'late' ? (
        <>
          <Row
            label={t('shiftEnd.shiftEnded', { defaultValue: 'Shift ended' })}
            value={shift.shiftEndAt ? clockOf(shift.shiftEndAt) : '—'}
          />
          <Row
            label={t('shiftEnd.stillWorkingUntil', { defaultValue: 'Still working until' })}
            value={clockOf(shift.clockOutAt)}
            tone="warn"
          />
        </>
      ) : (
        <Row
          label={t('shiftEnd.clockedOut', { defaultValue: 'Clocked out' })}
          value={clockOf(shift.clockOutAt)}
          /* ④ — the row carries the flag; the button is untouched. */
          flag={view.away ? `⚑ ${formatDistance(view.away.metres)}` : null}
        />
      )}

      {view.shortBy > 0 ? (
        <Row
          label={t('shiftEnd.short', { defaultValue: 'Short of your shift' })}
          value={formatDuration(view.shortBy)}
          tone="warn"
        />
      ) : null}

      <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.lineWell, marginVertical: amazen.space(2.5) }} />

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/*
          ⚠️ TWO STRINGS, NOT ONE. The hero's sub-label is lowercase `counted`
          — it finishes the sentence the figure started. The receipt's total is
          a row LABEL and takes a capital like every other row in it. Sharing
          one key put a lowercase word in a column of capitalised ones.
        */}
        <AText variant="body" tone="ink" style={{ fontSize: 14.5 }}>
          {t('shiftEnd.countedTotal', { defaultValue: 'Counted' })}
        </AText>
        <View style={{ flex: 1 }} />
        <AText variant="body" tone="strong" numeric style={{ fontSize: 16 }}>
          {formatDuration(shift.countedMinutes)}
        </AText>
      </View>
    </View>
  );
}
