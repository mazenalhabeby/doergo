import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDuration, personName } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import type { JobTimeSplit, JobTimeView } from '../../lib/api';
import { AText, LiveDot } from '../amazen';
import { SectionLabel } from './job-ui';

/**
 * Job time on the job page — the mockup's "Working" card.
 *
 * The big figure is WORKING time (from Start work, inside the shift); travel
 * and blocked are shown apart and never added to it. A bar draws the three to
 * scale. Under it, who started the job when it was the office, and why — the
 * job's history says it too.
 *
 * Renders nothing before any time has counted.
 */
export function JobTimeCard({
  time,
  paused,
  startedBy,
  meId,
}: {
  time: (JobTimeSplit & { live: keyof JobTimeSplit | null }) | null;
  /** Paused at a clock-out: nothing is running, whatever the step says. */
  paused: boolean;
  startedBy: JobTimeView['startedBy'];
  meId: string | null | undefined;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  if (!time || time.travel + time.working + time.blocked === 0) return null;
  const live = !paused && !!time.live;
  const sum = time.travel + time.working + time.blocked;
  const tone = { travel: c.inkMuted, working: c.accent, blocked: c.warn } as const;
  const kinds = (['travel', 'working', 'blocked'] as const).filter((k) => time[k] > 0);
  const name = (p?: { firstName: string; lastName: string } | null) => personName(p);

  return (
    <View style={{ backgroundColor: c.tile, borderRadius: amazen.radius.field, padding: amazen.space(4), gap: amazen.space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SectionLabel>{t('job.time.working')}</SectionLabel>
        <View style={{ flex: 1 }} />
        {live ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1) }}>
            {/* In the colour of what is running — a crew member's own stop runs as blocked. */}
            <LiveDot color={tone[time.live!]} live />
            <AText variant="caption" style={{ color: tone[time.live!] }}>{t('job.time.live')}</AText>
          </View>
        ) : paused ? (
          <AText variant="caption" tone="muted">{t('job.time.paused')}</AText>
        ) : null}
      </View>

      <AText variant="displaySm" tone="strong" numeric>{formatDuration(time.working)}</AText>

      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
        {kinds.map((k) => <View key={k} style={{ flex: time[k] / sum, backgroundColor: tone[k] }} />)}
      </View>

      <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
        {(['travel', 'working', 'blocked'] as const).map((k) => (
          <View key={k} style={{ flex: 1, gap: 2 }}>
            <AText variant="caption" style={{ color: tone[k] }}>{t(`job.time.${k}`)}</AText>
            <AText variant="body" tone="strong" numeric style={{ fontSize: 14 }}>{formatDuration(time[k])}</AText>
          </View>
        ))}
      </View>

      {startedBy?.office ? (
        <AText variant="caption" tone="warn">
          {[
            startedBy.forUser?.id === meId
              ? t('job.time.startedForYou', { name: name(startedBy.user) })
              : t('job.time.startedFor', { name: name(startedBy.user), for: name(startedBy.forUser) }),
            startedBy.reason ? `“${startedBy.reason}”` : null,
          ].filter(Boolean).join(' · ')}
        </AText>
      ) : null}
    </View>
  );
}
