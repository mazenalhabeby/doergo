import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { QuietButton } from '../job/job-ui';

/**
 * The top of a day picker drawn in JavaScript — the New job "Which day" sheet
 * and a step form's date field: Today and Tomorrow, then the month with its
 * arrows. Each wrote it out in full.
 */
export function DayPickerTop({
  year,
  month,
  onToday,
  onTomorrow,
  onShift,
  prevDisabled = false,
}: {
  year: number;
  /** 0–11. */
  month: number;
  onToday: () => void;
  onTomorrow: () => void;
  /** Move the month shown by -1 or +1. */
  onShift: (by: number) => void;
  /** The back arrow is greyed and inert (no going before this month). */
  prevDisabled?: boolean;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const months = t('monthNames', { returnObjects: true }) as unknown as string[];
  return (
    <>
      <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
        <View style={{ flex: 1 }}><QuietButton label={t('common.today')} onPress={onToday} /></View>
        <View style={{ flex: 1 }}><QuietButton label={t('common.tomorrow')} onPress={onTomorrow} /></View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
        <Pressable onPress={prevDisabled ? undefined : () => onShift(-1)} disabled={prevDisabled} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} style={{ opacity: prevDisabled ? 0.3 : 1, padding: amazen.space(2) }}>
          <AText variant="body" tone="strong">‹</AText>
        </Pressable>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontFamily: amazen.font.sansMedium }}>
          {`${months?.[month] ?? ''} ${year}`}
        </AText>
        <Pressable onPress={() => onShift(1)} accessibilityRole="button" accessibilityLabel={t('common.next')} hitSlop={8} style={{ padding: amazen.space(2) }}>
          <AText variant="body" tone="strong">›</AText>
        </Pressable>
      </View>
    </>
  );
}

/** The weekday initials over a month grid. */
export function WeekdayHeads() {
  const { t } = useTranslation();
  const heads = t('dayNames.headers', { returnObjects: true }) as unknown as string[];
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {(Array.isArray(heads) ? heads : []).map((h, i) => (
        <AText key={i} variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>{h}</AText>
      ))}
    </View>
  );
}
