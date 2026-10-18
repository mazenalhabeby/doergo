import { Pressable, View } from 'react-native';
import { AText, QuietButton, SheetOption } from '../amazen';
import { JobSheet } from '../job/job-ui';
import type { TimeBannersState } from './use-time-banners';
import type { TimeBanners } from './time-banners';

type Props = Parameters<typeof TimeBanners>[0];

/**
 * The end of the shift, said once (docs/plans/clock-attendance-2026-10.md, step 3):
 * "You left the Warehouse at 16:42 — clock out at 16:42?" when the phone saw them
 * go, otherwise "Your shift ended at 16:30" with Clock out / Ask for more time.
 * A session with no planned shift keeps its own words ("still working?").
 */
export function TimeBannersUnscheduledTitle({
  vm,
  busy,
  hasShiftScheduling,
  onRequestExtra,
  onClockOut,
  onForgot,
}: {
  vm: TimeBannersState;
  busy: Props['busy'];
  hasShiftScheduling: Props['hasShiftScheduling'];
  onRequestExtra: Props['onRequestExtra'];
  onClockOut: Props['onClockOut'];
  onForgot: Props['onForgot'];
}) {
  const { askEnded, amazen, unscheduled, t, hoursOpen, end, formatTime, tz, setForgot, setStillWorkingAt, entry } = vm;
  const { leftOffer, moreTime, setMoreTime, space } = vm;
  const endsAt = end ? formatTime(end.toISOString(), tz) : '';
  const box = { borderRadius: 18, padding: amazen.space(3.5), gap: amazen.space(2.5), backgroundColor: amazen.color.warnTint };
  const half = { flex: 1 };

  if (leftOffer) {
    const at = formatTime(leftOffer.leftAt.toISOString(), tz);
    return (
      <View style={box}>
        <View style={{ gap: 2 }}>
          <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{t('clockSmart.leftTitle', { place: space, time: at })}</AText>
          <AText variant="caption" tone="warn" style={{ fontSize: 13, lineHeight: 18 }}>{t('clockSmart.leftBody', { time: at })}</AText>
        </View>
        <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
          <View style={half}>
            <QuietButton
              tone="accent" label={t('clockSmart.yesAt', { time: at })} onPress={() => onForgot(leftOffer.leftAt)} disabled={busy}
            />
          </View>
          <View style={half}>
            <QuietButton label={t('clockSmart.otherTime')} onPress={() => setForgot(true)} disabled={busy} />
          </View>
        </View>
      </View>
    );
  }

  if (!askEnded) return null;

  if (unscheduled) {
    return (
      <View style={box}>
        <View style={{ gap: 2 }}>
          <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{t('shiftReminder.unscheduledTitle', { count: hoursOpen })}</AText>
          <AText variant="caption" tone="warn" style={{ fontSize: 13, lineHeight: 18 }}>{t('shiftReminder.unscheduledSubtitle')}</AText>
        </View>
        <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
          <View style={half}>
            <QuietButton label={t('shiftReminder.forgotClockOut')} onPress={() => setForgot(true)} disabled={busy} />
          </View>
          <View style={half}>
            <QuietButton
              tone="accent"
              label={t('shiftReminder.stillWorking')}
              onPress={() => setStillWorkingAt(entry?.reminderCount ?? 0)}
              disabled={busy}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={box}>
      <View style={{ gap: 2 }}>
        <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{t('clockSmart.endedTitle', { time: endsAt })}</AText>
        <AText variant="caption" tone="warn" style={{ fontSize: 13, lineHeight: 18 }}>{t('clockSmart.endedBody', { place: space })}</AText>
      </View>
      <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
        <View style={half}>
          <QuietButton
            tone="accent"
            label={t('clockSmart.clockOut')}
            onPress={() => (onClockOut ? onClockOut() : setForgot(true))}
            disabled={busy}
          />
        </View>
        {hasShiftScheduling ? (
          <View style={half}>
            <QuietButton label={t('clockSmart.askMoreTime')} onPress={() => setMoreTime(true)} disabled={busy} />
          </View>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setForgot(true)} disabled={busy} hitSlop={8}>
        <AText variant="caption" tone="muted" style={{ fontSize: 13 }}>{t('shiftReminder.forgotClockOut')}</AText>
      </Pressable>
      <JobSheet visible={moreTime} onClose={() => setMoreTime(false)} busy={busy} title={t('clockSmart.askMoreTime')}>
        <AText variant="caption" tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
          {t('clockSmart.moreTimeNote', { time: endsAt })}
        </AText>
        {/* The route takes no amount — the leader sets it when approving (extra-time decision). */}
        <SheetOption
          tone="accent"
          label={t('clockSmart.askLeader')}
          onPress={() => { setMoreTime(false); onRequestExtra(); }}
          disabled={busy}
        />
      </JobSheet>
    </View>
  );
}
