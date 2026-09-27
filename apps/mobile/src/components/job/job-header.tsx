import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { usePendingFor } from '../../offline/offline-context';
import { AText } from '../amazen';
import { TourTarget } from '../tour';
import { CloseGlyph } from './job-glyphs';
import { Dot, Pill, SectionLabel } from './job-ui';

/**
 * The top of the job — `renderDetail()`'s first block: the id and "waiting to
 * send", the step it is on, the title, and where it is in its own workflow.
 *
 * ⚠️ THE STEP NAME IS THE WORKFLOW'S (`stepLabelFor`), in the reader's
 * language where the words are the product's own and exactly as written where
 * an organization wrote them.
 */
/** The row that stays put above the scroll — the id, "waiting to send", and close (`.top`). */
export function JobTopRow({ taskId, jobId, pendingSync, fromPhone, onClose }: {
  taskId: string;
  jobId: string;
  pendingSync?: boolean;
  fromPhone: boolean;
  onClose: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const { waiting, attention } = usePendingFor(taskId);
  const waitingToSend = pendingSync || waiting > 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), paddingHorizontal: amazen.space(4), paddingTop: amazen.space(2.5), paddingBottom: amazen.space(1.5) }}>
      <AText variant="caption" tone="ink" numeric numberOfLines={1} style={{ flex: 1 }}>{jobId}</AText>
      {attention > 0 ? <Pill tone="critical" label={t('offline.chip.attention')} /> : waitingToSend ? <Pill label={t('offline.chip.waiting')} /> : null}
      {fromPhone ? <Pill label={t('offline.fromPhone')} /> : null}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        hitSlop={6}
        style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}
      >
        <CloseGlyph size={16} color={c.ink} />
      </Pressable>
    </View>
  );
}

export function JobHeader({
  stepLabel,
  blocked,
  closed,
  lateDays,
  priority,
  title,
  position,
  nextLabel,
}: {
  stepLabel: string;
  blocked: boolean;
  closed: boolean;
  lateDays: number;
  priority: string;
  title: string;
  position: { index: number; total: number };
  nextLabel: string | null;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const hot = priority === 'URGENT' || priority === 'HIGH';

  return (
    <View style={{ gap: amazen.space(2) }}>
      <TourTarget name="taskdetail-header" style={{ gap: amazen.space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <Dot tone={blocked ? 'critical' : closed ? 'dim' : 'accent'} />
          <View style={{ flexShrink: 1 }}>
            <SectionLabel tone={blocked ? 'critical' : 'accent'}>{stepLabel}</SectionLabel>
          </View>
          {lateDays > 0 && !closed ? (
            <View style={{ flexShrink: 1 }}>
              <SectionLabel tone="warn">{`· ${t('myWork.late', { count: lateDays })}`}</SectionLabel>
            </View>
          ) : null}
          {hot ? (
            <View style={{ marginLeft: 'auto' }}>
              <Pill tone={priority === 'URGENT' ? 'critical' : 'warn'} label={t(`priority.${priority}`)} />
            </View>
          ) : null}
        </View>
        <AText variant="h2" tone="strong" numberOfLines={4} style={{ fontFamily: amazen.font.sansLight, lineHeight: 29 }}>{title}</AText>
      </TourTarget>

      {position.index >= 0 && position.total > 0 ? (
        <TourTarget name="taskdetail-status" style={{ gap: amazen.space(1.5) }}>
          <View
            style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}
            accessibilityRole="progressbar"
            accessibilityLabel={t('job.stepOf', { index: position.index + 1, total: position.total })}
          >
            {Array.from({ length: position.total }).map((_, i) => (
              <View
                key={i}
                style={{
                  flex: 1, height: 4, borderRadius: 2,
                  backgroundColor: i <= position.index ? c.accent : c.tile,
                  opacity: i < position.index ? 0.55 : 1,
                }}
              />
            ))}
          </View>
          <AText variant="caption" tone="ink" numberOfLines={2}>
            {nextLabel
              ? t('job.stepOfNext', { index: position.index + 1, total: position.total, next: nextLabel })
              : t('job.stepOf', { index: position.index + 1, total: position.total })}
          </AText>
        </TourTarget>
      ) : null}
    </View>
  );
}
