import React from 'react';
import { Image, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import type { ServiceReport } from '../../lib/api';
import { AText, Well, WellDivider } from '../amazen';
import { SectionLabel } from './job-ui';
import { formatOnJob } from './job-logic';

/**
 * The service report a finished job was closed with — `GET /tasks/:id/report`.
 *
 * ⚠️ ASKED FOR ONLY WHEN IT IS SEEN: a closed job, and this section on screen
 * (the page calls `onLayout` → `loadReport`). A job that is still open has no
 * report to ask for, and one nobody scrolls to costs nothing.
 *
 * Jobs closed since step forms arrived keep their report as a step form
 * (`JobSubmissions`); an older job shows this one. Both, when it has both.
 */
export function JobReport({ report, sayNone = true, onLayout }: {
  report: ServiceReport | null | undefined | 'unreachable';
  /**
   * Say "No report was filed" when there is none. Off while the job's step
   * forms (its Reports) may hold its report instead — a job closed through a
   * step form has no service report, and saying so above its answers is wrong.
   */
  sayNone?: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatDateFull, formatTime } = useTimeFormat();
  const c = amazen.color;
  const row = (label: string, value: string | null | undefined, numeric = false) => (value ? (
    <View style={{ gap: 2, paddingVertical: amazen.space(1.5) }}>
      <AText variant="caption" tone="muted">{label}</AText>
      <AText variant="body" tone="strong" numeric={numeric} style={{ fontSize: 14, lineHeight: 20 }}>{value}</AText>
    </View>
  ) : null);

  // Nothing to say: keep the place (it is what asks for the report when seen), draw nothing.
  if (!sayNone && (report === null || report === undefined)) return <View onLayout={onLayout} />;

  return (
    <View onLayout={onLayout} style={{ gap: amazen.space(2) }}>
      <SectionLabel>{t('job.report.title')}</SectionLabel>
      {report === undefined ? (
        <AText variant="caption" tone="ink">{t('job.report.loading')}</AText>
      ) : report === 'unreachable' ? (
        <AText variant="caption" tone="warn">{t('job.report.offline')}</AText>
      ) : report === null ? (
        <AText variant="caption" tone="ink">{t('job.report.none')}</AText>
      ) : (
        <Well style={{ paddingVertical: amazen.space(2), paddingHorizontal: amazen.space(3.5) }}>
          {row(t('job.report.summary'), report.summary)}
          {report.workPerformed ? <WellDivider /> : null}
          {row(t('job.report.work'), report.workPerformed)}
          <WellDivider />
          <View style={{ flexDirection: 'row', gap: amazen.space(4) }}>
            <View style={{ flex: 1 }}>{row(t('job.report.duration'), formatOnJob(report.workDuration ?? 0), true)}</View>
            <View style={{ flex: 1 }}>{row(t('job.report.completedAt'), report.completedAt ? `${formatDateFull(report.completedAt, null)} ${formatTime(report.completedAt, null)}` : null)}</View>
          </View>
          {report.customerName ? <WellDivider /> : null}
          {row(t('job.report.customer'), report.customerName)}
          {report.customerSignature?.startsWith('data:image') ? (
            <View style={{ height: 64, borderRadius: 12, backgroundColor: '#ffffff', overflow: 'hidden', marginBottom: amazen.space(2), borderWidth: 1, borderColor: c.lineWell }}>
              {/* The signature is ink on white by construction — the pad paints white into the picture. */}
              <Image source={{ uri: report.customerSignature }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
          ) : null}
        </Well>
      )}
    </View>
  );
}
