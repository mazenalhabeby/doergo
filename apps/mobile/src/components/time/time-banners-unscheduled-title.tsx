import { View } from 'react-native';
import { AText, QuietButton } from '../amazen';
import type { TimeBannersState } from './use-time-banners';
import type { TimeBanners } from './time-banners';

/** Part of TimeBanners's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TimeBannersUnscheduledTitle({
  vm,
  busy,
  hasShiftScheduling,
  onRequestExtra,
}: {
  vm: TimeBannersState;
  busy: Parameters<typeof TimeBanners>[0]['busy'];
  hasShiftScheduling: Parameters<typeof TimeBanners>[0]['hasShiftScheduling'];
  onRequestExtra: Parameters<typeof TimeBanners>[0]['onRequestExtra'];
}) {
  const {
    askEnded,
    amazen,
    unscheduled,
    t,
    hoursOpen,
    end,
    formatTime,
    tz,
    setForgot,
    setStillWorkingAt,
    entry,
  } = vm;
  return (
    <>{askEnded ? (
      <View style={{ borderRadius: 18, padding: amazen.space(3.5), gap: amazen.space(2.5), backgroundColor: amazen.color.warnTint }}>
        <View style={{ gap: 2 }}>
          <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>
            {unscheduled ? t('shiftReminder.unscheduledTitle', { count: hoursOpen }) : t('shiftReminder.shiftEndedTitle')}
          </AText>
          <AText variant="caption" tone="warn" style={{ fontSize: 13, lineHeight: 18 }}>
            {end ? `${t('shiftReminder.shiftEndedAt', { time: formatTime(end.toISOString(), tz) })} · ` : ''}
            {unscheduled ? t('shiftReminder.unscheduledSubtitle') : t('shiftReminder.shiftEndedSubtitle')}
          </AText>
        </View>
        <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
          <View style={{ flex: 1 }}>
            <QuietButton label={t('shiftReminder.forgotClockOut')} onPress={() => setForgot(true)} disabled={busy} />
          </View>
          {unscheduled ? (
            <View style={{ flex: 1 }}>
              <QuietButton
                tone="accent"
                label={t('shiftReminder.stillWorking')}
                onPress={() => setStillWorkingAt(entry?.reminderCount ?? 0)}
                disabled={busy}
              />
            </View>
          ) : hasShiftScheduling ? (
            <View style={{ flex: 1 }}>
              <QuietButton
                tone="accent"
                label={t('shiftReminder.workingExtra')}
                onPress={onRequestExtra}
                disabled={busy}
              />
            </View>
          ) : null}
        </View>
      </View>
    ) : null}</>
  );
}
