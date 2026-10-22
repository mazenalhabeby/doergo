import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { daysLate } from '@hbcfield/shared/client';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useLocationTrackingContext } from '@/contexts/location-tracking-context';
import { useToast } from '@/island/island-context';
import { usePendingFor } from '@/offline/offline-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { holds, oversees } from '@/lib/permissions';
import type { Task } from '@/lib/api';
import { AText, Pill, QuietButton, RoundButton, SectionLabel } from '@/components/amazen';
import { MoreGlyph, NavigateGlyph } from '@/components/glyphs';
import { flowIdOf, hasHour, stepLabelFor, stepsFor } from '../home/my-work';
import { JadeButton } from '../job/job-dock';
import { decideNext, dockMode, formSheet, heldUntilDue, moreOptions, type MoreOption, type OpenSheet } from '../job/job-logic';
import { formForMove, moveKind, type WorkflowWithForms } from '../job/step-form-logic';
import { glyphFor } from '../job/step-glyph';
import { openJobInMaps } from '../job/maps';
import { refusalMessage, trackRouteFor, untrackRouteFor, type WriteStatus } from '../job/use-job-writes';
import { MoreSheet } from '../job/sheets/more-sheet';

/**
 * Next up — `activeCard()`. The same card as the home widget's active row,
 * with the REAL next step on its button (not "Open the job"), a Navigate disc
 * while the job is travel, and ⋯.
 *
 * ⚠️ THE DECISION IS THE JOB PAGE'S (`decideNext`), and the write is the job
 * page's too — `writeStatus` is handed down by the route from `task/[id].tsx`.
 * A step that needs the page (a step form, Report an issue, Decline, Assign…)
 * opens the job on that sheet instead of keeping a second copy of it here.
 */
export function NextUp({
  task,
  flows,
  writeStatus,
  onOpen,
  onChanged,
}: {
  task: Task & { pendingSync?: boolean };
  flows: Map<string, unknown>;
  writeStatus: WriteStatus;
  /** Open the job — on a sheet when one is named. */
  onOpen: (sheet?: OpenSheet) => void;
  /** A step was taken — the list re-reads. */
  onChanged: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const tracking = useLocationTrackingContext();
  const { formatTime, formatDueDate } = useTimeFormat();
  const c = amazen.color;
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const pending = usePendingFor(task.id);

  /* ---------------- the workflow's words ---------------- */

  // `null` when this phone does not hold the job's workflow: then the card only opens the job.
  const steps = stepsFor(task, flows);
  const flowId = flowIdOf(task);
  const workflow = (flowId ? flows.get(flowId) : null) as WorkflowWithForms | null | undefined;
  const workflowName = workflow?.name ?? null;
  const labelOf = useCallback((key: string) => stepLabelFor({ ...task, status: key as never }, flows, t as never), [task, flows, t]);
  const decision = steps ? decideNext(task.status, steps) : { primary: null, rest: [], resume: false };
  const target = decision.primary;
  const held = heldUntilDue(target, task.dueDate);
  const blocked = task.status === 'BLOCKED';
  const hasPlace = task.locationLat != null && task.locationLng != null;
  const moving = task.status === 'ACCEPTED' || task.status === 'EN_ROUTE';
  const oversee = oversees(user);

  /* ---------------- the step ---------------- */

  const step = useCallback(async (to: string) => {
    const from = task.status;
    setBusy(true);
    try {
      trackRouteFor(tracking, task, from, to);
      const outcome = await writeStatus(task, to);
      if (outcome.kind === 'refused') throw new Error(refusalMessage(t as never, outcome));
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      else toast.success(labelOf(to), task.title);
      onChanged();
    } catch (err) {
      untrackRouteFor(tracking, task, from, to);
      toast.error(err instanceof Error && err.message ? err.message : t('taskDetail.failedToUpdateStatus'));
    } finally {
      setBusy(false);
    }
  }, [task, tracking, writeStatus, toast, t, labelOf, onChanged]);

  /**
   * The job page's rule (`moveKind`): a step whose form asks something opens
   * the job on that form, Blocked asks what is wrong — both on the page.
   * Anything else just goes.
   */
  const go = (to: string) => {
    const kind = moveKind(to, steps ? formForMove(workflow, steps, to, workflowName) : { form: null, source: null });
    if (kind === 'issue') { onOpen('issue'); return; }
    if (kind === 'form') { onOpen(formSheet(to)); return; }
    void step(to);
  };

  const options = moreOptions({
    mode: dockMode({ closed: false, oversees: oversee, isMine: true }),
    decision,
    isMine: true,
    status: task.status,
    hasPlace,
    oversees: oversee,
    canAssign: holds(user, 'canAssignTasks'),
    canEdit: holds(user, 'canCreateTasks'),
  });
  const pick = (o: MoreOption) => {
    setMore(false);
    switch (o.kind) {
      case 'step': go(o.to); return;
      case 'issue': go('BLOCKED'); return;
      case 'maps': openJobInMaps(task, 'show'); return;
      default: onOpen(o.kind); return;
    }
  };

  /* ---------------- what it says ---------------- */

  const late = Math.max(0, daysLate(task.dueDate ?? null) ?? 0);
  const due = task.dueDate
    ? `${formatDueDate(task.dueDate)}${hasHour(task.dueDate) ? ` ${formatTime(task.dueDate, null)}` : ''}`
    : null;
  const meta = [
    late > 0 ? t('myWork.late', { count: late }) : due,
    task.locationAddress,
    (task as unknown as { space?: { name?: string } }).space?.name,
  ].filter(Boolean).join(' · ');
  const stepLabel = blocked && !steps?.some((s) => s.key === 'BLOCKED') ? t('status.BLOCKED') : labelOf(task.status);

  return (
    <View style={{ backgroundColor: c.tile, borderRadius: 20, padding: amazen.space(3.5), gap: amazen.space(1.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: blocked ? c.critical : late > 0 ? c.warn : c.accent }} />
        <SectionLabel tone={blocked ? 'critical' : late > 0 ? 'warn' : 'muted'} style={{ flex: 1 }}>{stepLabel}</SectionLabel>
        {pending.attention > 0 ? <Pill tone="critical" label={t('offline.chip.attention')} />
          : task.pendingSync || pending.waiting > 0 ? <Pill label={t('offline.chip.waiting')} /> : null}
      </View>
      <Pressable
        onPress={() => onOpen()}
        accessibilityRole="button"
        accessibilityLabel={`${t('myWork.openJob')}: ${task.title}`}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
        <AText variant="h3" tone="strong" numberOfLines={2} style={{ fontSize: 17, lineHeight: 23 }}>{task.title}</AText>
        {meta ? <AText variant="caption" tone="ink" numberOfLines={1}>{meta}</AText> : null}
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2), marginTop: amazen.space(1.5) }}>
        {target && steps ? (
          <JadeButton
            label={held ? t('taskDetail.statusActions.notYetAvailable') : decision.resume ? t('job.dock.backToWork') : labelOf(target)}
            Glyph={glyphFor(target, steps, workflowName)}
            onPress={() => go(target)}
            disabled={held || busy}
            loading={busy}
          />
        ) : (
          <View style={{ flex: 1 }}><QuietButton label={t('myWork.openJob')} onPress={() => onOpen()} /></View>
        )}
        {moving && hasPlace ? (
          <RoundButton
            Glyph={NavigateGlyph}
            tone="jade"
            label={t('job.dock.navigate')}
            onPress={() => openJobInMaps(task, 'navigate')}
          />
        ) : null}
        <RoundButton Glyph={MoreGlyph} label={t('job.dock.more')} onPress={() => setMore(true)} disabled={busy} />
      </View>

      <MoreSheet
        visible={more}
        onClose={() => setMore(false)}
        title={task.title}
        options={options}
        labelOf={labelOf}
        assigned={!!task.assignedToId}
        onPick={pick}
      />
    </View>
  );
}
