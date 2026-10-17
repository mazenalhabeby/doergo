import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText, Well, SectionLabel } from '../amazen';
import { formatDuration } from '@hbcfield/shared/client';

/**
 * THIS WEEK — seven bars and three figures.
 *
 * ⚠️ COUNTED TIME, CALLED COUNTED. The bars are the same figure payroll reads
 * (`paidMinutes`, falling back to `totalMinutes` on older entries) — never the
 * word "paid" on screen.
 *
 * ⚠️ TODAY'S BAR INCLUDES THE SHIFT BEING WORKED. The totals count closed
 * shifts only; a week strip that ignored the hours being worked while
 * somebody looks at it would be wrong in the one way they would notice.
 *
 * No target line: a weekly target exists for nobody in the data today, and a
 * bar measured against an invented 40h would be a claim.
 */
export function TimeWeek({
  weekDays,
  runningMinutes,
  monthMinutes,
  now,
}: {
  weekDays: readonly number[];
  /** Counted so far on the shift being worked, added to today. */
  runningMinutes: number;
  monthMinutes: number | null;
  now: Date;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const todayIdx = (now.getDay() + 6) % 7;
  const days = weekDays.map((m, i) => (i === todayIdx ? m + runningMinutes : m));
  const total = days.reduce((a, b) => a + b, 0);
  const worked = days.filter((m) => m > 0).length;
  const peak = Math.max(8 * 60, ...days);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIdx);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const letters = Array.from({ length: 7 }, (_, i) =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).toLocaleDateString(i18n.language, { weekday: 'narrow' }),
  );

  return (
    <Well style={{ padding: amazen.space(3.5), gap: amazen.space(3) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <SectionLabel>{t('time.week.title', 'This week')}</SectionLabel>
        <SectionLabel tone="accent">{`${fmt(monday)} – ${fmt(sunday)}`}</SectionLabel>
      </View>

      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: amazen.space(1.5), height: 96 }}
        accessibilityLabel={t('time.week.a11y', {
          defaultValue: '{{time}} counted this week',
          time: formatDuration(total),
        })}>
        {days.map((m, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: '100%',
                height: Math.max(4, Math.round((m / peak) * 76)),
                borderRadius: 6,
                backgroundColor: m === 0 ? c.tile : c.accent,
                // Past days are the same ink, quieter — today is the one being written.
                opacity: m === 0 || i === todayIdx ? 1 : 0.4,
              }}
            />
            <AText variant="caption" numeric style={{ fontSize: 10, color: i === todayIdx ? c.accent : c.inkMuted }}>{letters[i]}</AText>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
        <Figure value={formatDuration(total)} label={t('time.week.counted', 'counted')} />
        <Figure value={String(worked)} label={t('time.week.days', { count: worked, defaultValue: 'days worked' })} />
        <Figure
          value={monthMinutes == null ? '—' : formatDuration(monthMinutes + runningMinutes)}
          label={t('time.week.month', 'this month')}
        />
      </View>
    </Well>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  const { amazen } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 14,
        backgroundColor: amazen.color.tile,
        paddingVertical: amazen.space(2.25),
        paddingHorizontal: amazen.space(2.5),
      }}>
      <AText
        variant="body"
        tone="strong"
        numeric
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ fontSize: 18, lineHeight: 24 }}
      >
        {value}
      </AText>
      <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 10.5 }}>{label}</AText>
    </View>
  );
}
