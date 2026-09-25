import React from 'react';
import { Linking, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { daysLate, type FlowStatus } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import type { Task } from '../../lib/api/types';
import { SyncChip } from '../../offline/components/sync-chip';
import { AText, Eyebrow, GhostButton, LiveDot, PrimaryButton } from '../amazen';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { hasHour, type Decision } from './my-work';

/**
 * A job, opened from the My work card — the same sheet model as every button
 * on the shift card (Report, Break, the clock-out receipt): one BlurSheet slot,
 * one SheetPanel surface.
 *
 * ⚠️ IT REPLACES THE ⋯ MENU; IT DOES NOT SIT BESIDE IT. A tapped row, a tapped
 * title and the ⋯ all open this. Two sheets for one job is two places where
 * its actions can drift apart.
 *
 * ⚠️ THE VERB IS THE SAME ONE THE CARD SHOWS. The sheet renders the decision
 * it is handed; it never works out its own, so it cannot offer a transition
 * the card would not.
 */
export function JobSheet({
  task, decision, busy, onClose, onVerb, onOpenFull,
}: {
  task: Task | null;
  decision: Decision | null;
  busy: boolean;
  onClose: () => void;
  onVerb: (to: FlowStatus) => void;
  onOpenFull: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime } = useTimeFormat();
  const c = amazen.color;

  const late = task ? daysLate(task.dueDate ?? null) ?? 0 : 0;
  const due = task?.dueDate ? new Date(task.dueDate) : null;
  const when = due
    ? [
        due.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }),
        hasHour(task!.dueDate) ? formatTime(task!.dueDate!) : null,
      ].filter(Boolean).join(' · ')
    : null;
  const space = (task as unknown as { space?: { name?: string } } | null)?.space?.name;
  const who = task?.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`.trim() : null;

  /* ⚠️ Coerced before they go into a URL; zero is a legal coordinate. */
  const lat = Number(task?.locationLat);
  const lng = Number(task?.locationLng);
  const canNavigate = task?.locationLat != null && task?.locationLng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const navigate = () => {
    const url = Platform.select({ ios: `maps:0,0?daddr=${lat},${lng}`, android: `google.navigation:q=${lat},${lng}` });
    if (url) void Linking.openURL(url).catch(() => Linking.openURL(`geo:${lat},${lng}`));
  };

  return (
    <BlurSheet visible={!!task} onClose={onClose}>
      <SheetPanel onClose={onClose}>
        {task ? (
          <View style={{ gap: amazen.space(4) }}>
            <View style={{ gap: amazen.space(1.5) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
                <LiveDot color={late > 0 ? c.warn : c.accent} live={false} />
                <Eyebrow tone={late > 0 ? 'warn' : 'muted'} style={{ flexShrink: 1 }}>
                  {decision?.current.label ?? task.status.replace(/_/g, ' ')}
                  {late > 0 ? ` · ${t('myWork.late', { count: late, defaultValue: `${late} days late` })}` : ''}
                </Eyebrow>
                <SyncChip entityId={task.id} />
              </View>
              <AText variant="h2" tone="strong" style={{ fontWeight: '300' }}>{task.title}</AText>
            </View>

            {/* The facts, in one tile — the same shape as the Report sheet's context. */}
            {when || task.locationAddress || space || who ? (
              <View style={{ backgroundColor: c.tile, borderRadius: amazen.radius.field, paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(4), gap: amazen.space(1.5) }}>
                {when ? <Fact label={t('myWork.when', { defaultValue: 'When' })} value={when} /> : null}
                {task.locationAddress ? <Fact label={t('myWork.where', { defaultValue: 'Where' })} value={task.locationAddress} /> : null}
                {space ? <Fact label={t('myWork.workspace', { defaultValue: 'Workspace' })} value={space} /> : null}
                {who ? <Fact label={t('myWork.who', { defaultValue: 'Who' })} value={who} /> : null}
              </View>
            ) : null}

            {task.description ? (
              <AText variant="body" tone="ink" numberOfLines={4}>{task.description}</AText>
            ) : null}

            <View style={{ gap: amazen.space(2) }}>
              {decision ? (
                <PrimaryButton label={decision.primary.label} loading={busy} onPress={() => onVerb(decision.primary)} />
              ) : null}
              {decision?.rest.map((s) => (
                <GhostButton
                  key={s.key}
                  label={s.key === 'BLOCKED' ? t('myWork.reportIssue', { defaultValue: 'Report an issue' }) : s.label}
                  tone={s.key === 'BLOCKED' ? 'critical' : 'strong'}
                  disabled={busy}
                  onPress={() => onVerb(s)}
                />
              ))}
              {canNavigate ? <GhostButton label={t('taskDetail.navigate', { defaultValue: 'Navigate' })} tone="accent" onPress={navigate} /> : null}
              <GhostButton label={t('myWork.openFull', { defaultValue: 'Open full job' })} tone="strong" onPress={onOpenFull} />
            </View>
          </View>
        ) : null}
      </SheetPanel>
    </BlurSheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { amazen } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: amazen.space(3) }}>
      <AText variant="caption" tone="muted" style={{ width: 84 }}>{label}</AText>
      <AText variant="caption" tone="strong" style={{ flex: 1 }}>{value}</AText>
    </View>
  );
}
