import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlowStatus } from '@hbcfield/shared/client';
import { useOffline } from '../../offline/offline-context';
import { useIsland } from '../../island/island-context';
import { useLocationTrackingContext } from '../../contexts/location-tracking-context';
import { changeTaskStatus, addTaskComment, declineTask, completeTaskWithReport } from '../../offline/tasks/task-actions';
import { takeStatusFix, outboxFix, taskDestination } from '../../offline/tasks/status-fix';
import { reportIssueFromPhone } from '../../offline/issues/issue-actions';
import { tasksApi, reportsApi } from '../../lib/api';
import { shiftIssuesApi } from '../../lib/api/shift-issues';
import type { Task } from '../../lib/api/types';
import { has } from './job-flow';

type Outcome = { kind: 'done' | 'queued' | 'refused'; code?: string; message?: string };

/**
 * Everything a member can DO to a job from the home screen, in one place — the
 * card's verb and the job sheet go through the same function, so they cannot
 * behave differently.
 *
 * ⚠️ TRACKING FOLLOWS `gps`, NOT A STEP NAME. It starts when the job moves
 * INTO a gps step and stops when it moves OUT of one — so a workflow whose
 * travel step is called "On the road" is tracked, which the task screen's
 * `status === 'EN_ROUTE'` never did (§04 rule 1).
 */
export function useJobActions(onChanged?: () => void) {
  const { t } = useTranslation();
  const toast = useIsland();
  const offline = useOffline();
  const { startTracking, stopTracking } = useLocationTrackingContext();
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);

  const refusal = useCallback((o: Outcome) =>
    (o.code && t(`offline.errors.${o.code}`, { defaultValue: '' })) || o.message || t('taskDetail.failedToUpdateStatus'),
  [t]);

  /*
    ⚠️ AN ORGANIZATION WITHOUT THE OFFLINE LAYER HAS NO ENGINE — and never
    will, it is a per-organization switch. Every action therefore has the
    task screen's shape: the queue when there is one, the server directly
    when there is not. "This phone is still starting up" was shown to such a
    member on every press (01.png, 22:01) — true of nothing.
  */
  const guard = useCallback(async (id: string, work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    try { await work(); }
    catch (err) { toast.error(err instanceof Error && err.message ? err.message : t('taskDetail.failedToUpdateStatus')); }
    finally { lock.current = false; setBusy(null); onChanged?.(); }
  }, [onChanged, toast, t]);

  /** Move the job one step. */
  const advance = useCallback((task: Task, current: FlowStatus, to: FlowStatus) => guard(task.id, async () => {
    const engine = offline.engine;
    const leaving = has(current, 'gps') && !has(to, 'gps');
    const setting = has(to, 'gps') && !has(current, 'gps');
    if (leaving) stopTracking();
    if (setting) void startTracking(task.id, taskDestination(task));
    /*
      ⚠️ THE CHECK-IN IS TAKEN ON ARRIVAL — the first step after a gps step —
      and wherever the step itself tracks. Not only at ARRIVED / IN_PROGRESS
      (§04 rule 2), so "Working" and "Picked up" get one too.
    */
    const fix = leaving || has(to, 'gps') ? await takeStatusFix('ARRIVED') : await takeStatusFix(to.key);
    const undoTracking = () => {
      if (leaving) void startTracking(task.id, taskDestination(task));
      if (setting) stopTracking();
    };
    if (!engine) {
      try { await tasksApi.updateStatus(task.id, to.key, undefined, fix); }
      catch (err) { undoTracking(); throw err; }
      toast.success(to.label, task.title);
      return;
    }
    const outcome = await changeTaskStatus(engine, { taskId: task.id, from: task.status, to: to.key, fix: outboxFix(fix) }) as Outcome;
    if (outcome.kind === 'refused') {
      undoTracking();
      toast.error(refusal(outcome));
      return;
    }
    if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
    else toast.success(to.label, task.title);
  }), [guard, offline.engine, startTracking, stopTracking, toast, t, refusal]);

  /** Decline — back to the office. Only offered where the workflow can move to a cancel step. */
  const decline = useCallback((task: Task) => guard(task.id, async () => {
    const engine = offline.engine;
    if (!engine) {
      await tasksApi.declineTask(task.id);
      toast.info(t('myWork.declined', { defaultValue: 'Declined' }), task.title);
      return;
    }
    const outcome = await declineTask(engine, { taskId: task.id }) as Outcome;
    if (outcome.kind === 'refused') { toast.error(refusal(outcome)); return; }
    toast.info(t('myWork.declined', { defaultValue: 'Declined' }), task.title);
  }), [guard, offline.engine, toast, t, refusal]);

  /**
   * Finish the job.
   *
   * ⚠️ ASK ONLY FOR WHAT THE STEP NAMES. With `report` on the final step it
   * becomes a service report — one required line, the signature only if the
   * step asks for one, the customer's only if the job has a customer. Without
   * it, the step moves and the line is kept as a note on the job.
   */
  const finish = useCallback((task: Task, current: FlowStatus, to: FlowStatus, input: {
    summary: string; workSeconds: number; signature?: string | null; customerName?: string; customerSignature?: string | null;
  }) => guard(task.id, async () => {
    const engine = offline.engine;
    const report = {
      summary: input.summary.trim(),
      workDuration: Math.max(0, Math.round(input.workSeconds)),
      technicianSignature: input.signature ?? undefined,
      customerSignature: input.customerSignature ?? undefined,
      customerName: input.customerName?.trim() || undefined,
    };
    if (!engine) {
      if (has(to, 'report')) await reportsApi.completeTask(task.id, report);
      else {
        await tasksApi.updateStatus(task.id, to.key);
        if (report.summary) await tasksApi.addComment(task.id, report.summary);
      }
      toast.success(t('myWork.finished', { defaultValue: 'Job finished' }), task.title);
      return;
    }
    if (has(to, 'report') && offline.files) {
      const { outcome } = await completeTaskWithReport(engine, offline.files, {
        taskId: task.id,
        report,
        photos: [],
      }) as { outcome: Outcome };
      if (outcome.kind === 'refused') { toast.error(refusal(outcome)); return; }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      else toast.success(t('myWork.finished', { defaultValue: 'Job finished' }), task.title);
      return;
    }
    const outcome = await changeTaskStatus(engine, { taskId: task.id, from: task.status, to: to.key, fix: null }) as Outcome;
    if (outcome.kind === 'refused') { toast.error(refusal(outcome)); return; }
    if (input.summary.trim()) await addTaskComment(engine, { taskId: task.id, content: input.summary.trim() });
    if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
    else toast.success(t('myWork.finished', { defaultValue: 'Job finished' }), task.title);
    void current;
  }), [guard, offline.engine, offline.files, toast, t, refusal]);

  /**
   * "Something is wrong."
   *
   * ⚠️ IT DOES NOT MOVE THE JOB. It files an issue with the people responsible
   * for the job's workspace — the same route as Report on the shift card — and
   * leaves a note on the job so its history says what happened. Always
   * available: never tied to a BLOCKED step, which none of the organization's
   * workflows has (§04 rule 4).
   */
  const reportWrong = useCallback((task: Task, input: { reason: string; severity: string; note?: string }) => guard(task.id, async () => {
    const spaceId = (task as unknown as { spaceId?: string | null }).spaceId ?? undefined;
    const title = `${input.reason} · ${task.title}`.slice(0, 200);
    const description = [input.note?.trim(), `${task.title}${task.locationAddress ? ` · ${task.locationAddress}` : ''}`].filter(Boolean).join('\n\n');
    const engine = offline.engine;
    const note = `⚠ ${input.reason}${input.note?.trim() ? ` — ${input.note.trim()}` : ''}`;
    if (!engine || !offline.files) {
      await shiftIssuesApi.create({ title, description, severity: input.severity, spaceId });
      await tasksApi.addComment(task.id, note);
      toast.say({ tone: 'waiting', title: t('myWork.wrongSent', { defaultValue: 'Sent to the office' }), body: task.title });
      return;
    }
    try {
      const { outcome } = await reportIssueFromPhone(engine, offline.files, { title, description, severity: input.severity, spaceId, photos: [] }) as { outcome: Outcome };
      if (outcome.kind === 'refused') { toast.error(refusal(outcome)); return; }
      await addTaskComment(engine, { taskId: task.id, content: note });
      if (outcome.kind === 'queued') { toast.info(t('offline.savedForLater')); return; }
      toast.say({ tone: 'waiting', title: t('myWork.wrongSent', { defaultValue: 'Sent to the office' }), body: task.title });
    } catch {
      toast.error(t('myWork.wrongFailed', { defaultValue: 'Could not send it. Try again.' }));
    }
  }), [guard, offline.engine, offline.files, toast, t, refusal]);

  return { busy, advance, decline, finish, reportWrong };
}
