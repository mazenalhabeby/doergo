import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { AText } from './amazen';
import { readClockOut, type ClockOutShift } from './home/clock-out-state';
import { formatDuration } from '@hbcfield/shared/client';
import { Hatch } from './clock-out-sheet-shared';

/** Bar, moved here unchanged out of clock-out-sheet.tsx. */
/**
 * THE DAY, TO SCALE.
 *
 * ⚠️ SEGMENTS AS FLEX WEIGHTS, so it is always to scale whatever the shift
 * was. Jade is worked, the notch is the rest, hatched amber is over, empty
 * track is the shortfall — you see the SHAPE of the shift before you read a
 * figure.
 */
export function Bar({
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
  const { worked, rest, over, short } = view.bar;

  return (
    <View style={{ marginTop: amazen.space(4) }}>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.tile }}>
        <View style={{ flex: worked, backgroundColor: c.accent }} />
        {rest > 0 ? <View style={{ flex: rest, backgroundColor: c.sunken }} /> : null}
        {over > 0 ? <Hatch flex={over} /> : null}
        {short > 0 ? <View style={{ flex: short, backgroundColor: c.tile }} /> : null}
      </View>

      <View style={{ flexDirection: 'row', marginTop: amazen.space(1.5) }}>
        <AText variant="caption" tone="muted" numeric style={{ fontSize: 11.5 }}>
          {clockOf(shift.clockInAt)}
        </AText>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'flex-end' }}>
          <AText variant="caption" tone="muted" numeric style={{ fontSize: 11.5 }}>
            {clockOf(shift.clockOutAt)}
          </AText>
          {view.overBy > 0 ? (
            <AText variant="caption" tone="warn" numeric style={{ fontSize: 11 }}>
              {t('shiftEnd.over', { duration: formatDuration(view.overBy), defaultValue: `${formatDuration(view.overBy)} over` })}
            </AText>
          ) : view.shortBy > 0 ? (
            <AText variant="caption" tone="muted" numeric style={{ fontSize: 11 }}>
              {formatDuration(view.shortBy)}
            </AText>
          ) : null}
        </View>
      </View>

      {rest > 0 ? (
        <AText variant="caption" tone="muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 2 }}>
          {t('shiftEnd.restNotch', { duration: formatDuration(rest), defaultValue: `${formatDuration(rest)} rest` })}
        </AText>
      ) : null}
    </View>
  );
}
