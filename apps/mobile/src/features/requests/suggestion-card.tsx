import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDuration, type DetectedRequest } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { AText } from '@/components/amazen';

/**
 * "This looks like…" — what the words in "Other" seem to ask, with the dates
 * and numbers read from them. Shown, never applied: one tap uses it, and the
 * form it opens is still checked before anything is sent.
 */
export function SuggestionCard({ suggestion, onUse }: { suggestion: DetectedRequest; onUse: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const day = (k: string) =>
    new Date(`${k}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const s = suggestion;
  const facts = [
    s.leaveType ? t(`requests.detect.leaveType.${s.leaveType}`) : null,
    s.startDate ? (s.endDate ? `${day(s.startDate)} – ${day(s.endDate)}` : day(s.startDate)) : null,
    s.startTime ? t('requests.detect.from', { time: s.startTime }) : null,
    s.endTime ? t('requests.detect.until', { time: s.endTime }) : null,
    s.minutes ? `+${formatDuration(s.minutes)}` : null,
    // The amount as written — the currency is the organization's, chosen on the expense itself.
    s.amountCents != null
      ? (s.amountCents / 100).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onUse}
      accessibilityRole="button"
      accessibilityHint={t('requests.detect.use')}
      style={({ pressed }) => ({
        borderRadius: 16,
        padding: amazen.space(3),
        backgroundColor: c.accentTint,
        opacity: pressed ? 0.85 : 1,
        gap: amazen.space(1),
      })}
    >
      <AText variant="caption" tone="muted" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
        {t('requests.detect.title')}
      </AText>
      <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{t(`requests.detect.kind.${s.kind}`)}</AText>
      {facts ? <AText variant="caption" tone="onGlass" style={{ fontSize: 13 }}>{facts}</AText> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <AText variant="caption" tone="accent" style={{ fontSize: 13, fontFamily: amazen.font.sansMedium }}>
          {t('requests.detect.use')} ›
        </AText>
      </View>
    </Pressable>
  );
}
