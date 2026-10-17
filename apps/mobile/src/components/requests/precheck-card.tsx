import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDuration, type RequestPrecheck } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { toneTint } from '../../theme/tone-color';

type Tone = 'critical' | 'warn' | 'accent' | 'muted';

/**
 * WHAT A LEADER WOULD CHECK, said before sending — one line each, worst first.
 * Only what is worth saying: nothing appears for a request that is simply fine
 * except a quiet "looks fine". Advice — the member may still send.
 */
export function PrecheckCard({ precheck, kind }: { precheck: RequestPrecheck | null; kind: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  if (!precheck) return null;
  const day = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  const lines: Array<{ tone: Tone; text: string }> = [];
  for (const cl of precheck.clashes) {
    lines.push({ tone: 'critical', text: t('requests.precheck.clash', { from: day(cl.startDate), to: day(cl.endDate) }) });
  }
  if (precheck.balance && precheck.balance.after < 0) {
    lines.push({ tone: 'critical', text: t('requests.precheck.negative', { after: precheck.balance.after }) });
  }
  if (precheck.cover === 'short' || precheck.cover === 'skill')
    lines.push({ tone: 'warn', text: t(`requests.precheck.cover.${precheck.cover}`) });
  if (precheck.dailyLimit?.over) {
    const d = precheck.dailyLimit;
    lines.push({
      tone: 'warn',
      text: t('requests.precheck.dailyLimit', {
        total: formatDuration(d.plannedMinutes + d.requestedMinutes),
        limit: formatDuration(d.limitMinutes),
      }),
    });
  }
  if (precheck.cover === 'tight') lines.push({ tone: 'warn', text: t('requests.precheck.cover.tight') });
  if (precheck.secondApproval) lines.push({ tone: 'accent', text: t('requests.precheck.second', { role: precheck.secondApproval }) });
  if (!lines.length) lines.push({ tone: 'muted', text: t(kind === 'LEAVE' ? 'requests.precheck.fineLeave' : 'requests.precheck.fine') });

  const bg = toneTint(c, lines[0]!.tone, c.accentTint);
  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: 16,
        paddingVertical: amazen.space(2.5),
        paddingHorizontal: amazen.space(3),
        backgroundColor: bg,
        gap: amazen.space(1),
      }}>
      <AText variant="caption" tone="muted" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
        {t('requests.precheck.title')}
      </AText>
      {lines.map((l, i) => (
        <AText
          key={i}
          variant="caption"
          tone={l.tone === 'muted' ? 'muted' : l.tone}
          style={{ fontSize: 13, lineHeight: 18 }}
        >{`• ${l.text}`}</AText>
      ))}
    </View>
  );
}
