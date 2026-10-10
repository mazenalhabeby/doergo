import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StepForm, StepFormAnswers } from '@hbcfield/shared/client';
import {
  tasksApi, taskAttachmentsApi, uploadToPresignedUrl, TaskStatus,
  type Task, type UpdateTaskInput,
} from '../../lib/api';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { useOffline } from '../../offline/offline-context';
import { useRefreshMyHandovers } from '../../hooks/useMyHandovers';
import { useRefreshJobTime } from '../../hooks/useJobTime';
import { mergeAttachments, pendingAttachments } from '../../offline/tasks/overlay';
import { addTaskComment, addTaskPhoto, declineTask, resumeJob, writeHandover, type ActionOutcome } from '../../offline/tasks/task-actions';
import { taskDestination } from '../../offline/tasks/status-fix';
import type { PickedImage } from '../../hooks/useImagePicker';
import type { JobState, JobTask } from './use-job';
import { refusalText } from '../../lib/distance';
import { prepareStepForm, reasonFromAnswers, signatureFile, refusalFieldErrors, type DraftPhoto, type FormDraft } from './step-form-logic';
import { personName } from '@hbcfield/shared/client';

/**
 * The one status write — `changeTaskStatus` through the outbox, with the GPS
 * fix taken by `takeStatusFix`. It lives on the SCREEN (`task/[id].tsx`) and is
 * handed in, so the screen stays the single place a status leaves the phone.
 */
export type WriteStatus = (task: Task, to: string, reason?: string, extras?: StatusExtras) => Promise<ActionOutcome>;

/** What a move into a step with a form carries beside the status. */
export interface StatusExtras {
  /** The step form's answers — photo and signature values are attachment ids of this job. */
  answers?: StepFormAnswers;
  /** The queued `task.attachment` operations those files are, still unsent — the move waits for them. */
  dependsOn?: string[];
}

/** How a move with a form ended: sent (or kept to send), or refused with the fields to point at. */
type FormMoveResult = { ok: true } | { ok: false; fieldErrors?: Record<string, string> };

export interface Member { id: string; firstName: string; lastName: string }

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * A refusal in the member's language: the server's code first, its message
 * second. Exported because the Jobs tab's Next up card moves a job with the
 * same write and has to say the same sentence when it is refused.
 */
export function refusalMessage(t: Translate, o: { code?: string; message?: string; params?: Record<string, unknown>; conflict?: boolean }): string {
  return refusalText(t, o, t(o.conflict ? 'offline.errors.CONFLICT' : 'taskDetail.failedToUpdateStatus'));
}

interface RouteTracking {
  startTracking: (taskId: string, destination: ReturnType<typeof taskDestination>) => unknown;
  stopTracking: () => unknown;
}

/**
 * The route recorder follows the step: it starts on the way there and stops
 * on arrival. ⚠️ ONE RULE for the job page AND the Jobs tab — a step taken
 * from the list that skipped this would drive a route nobody records.
 */
export function trackRouteFor(tracking: RouteTracking, task: Task, from: string, to: string): void {
  if (from === TaskStatus.EN_ROUTE && to === TaskStatus.ARRIVED) tracking.stopTracking();
  if (to === TaskStatus.EN_ROUTE) void tracking.startTracking(task.id, taskDestination(task));
}

/** Put the recorder back the way it was when the step was refused. */
export function untrackRouteFor(tracking: RouteTracking, task: Task, from: string, to: string): void {
  if (from === TaskStatus.EN_ROUTE && to === TaskStatus.ARRIVED) void tracking.startTracking(task.id, taskDestination(task));
  if (to === TaskStatus.EN_ROUTE) tracking.stopTracking();
}

/**
 * Everything the job page WRITES.
 *
 * ⚠️ QUEUED WHERE A QUEUE EXISTS. Comments, photos, status (with a step
 * form's answers) and decline go through the offline engine first; the direct API call is
 * only the path for a build without it (`queued-writes-guard.spec` counts
 * them). Assign, edit, a checklist tick and deleting a file have no outbox
 * operation, so they are direct — and the page disables them with no signal.
 */
export function useJobWrites(job: JobState, deps: { writeStatus: WriteStatus; onClosed: () => void; labelOf: (key: string) => string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const offline = useOffline();
  // The home strip and the clock-out sheet read the same picture this changes.
  const refreshHandovers = useRefreshMyHandovers();
  // Every move changes the job's time split; read it again.
  const refreshJobTime = useRefreshJobTime();
  const { task, setTask, setComments, setAttachments, pushLocalEvent, tracking, reloadSubmissions } = job;
  const { writeStatus, onClosed, labelOf } = deps;
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  /*
    ⚠️ A FAILURE IS SAID ON THE PAGE, NOT ONLY IN THE ISLAND. The job page is a
    modal screen, and the island is drawn UNDER it — every refusal ("You
    already have an active job") was shown where nobody could see it, so the
    button simply looked dead. The island still speaks (it is seen once the
    page closes); the page shows the same words in its dock.
  */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  const fail = (title: string, body?: string) => {
    setNotice(body || title);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 8000);
    toast.error(title, body);
  };

  /** A refusal in the member's language: the server's code first, its message second. */
  const refusalText = useCallback((o: { code?: string; message?: string; conflict?: boolean }) =>
    refusalMessage(t as Translate, o), [t]);

  /** Apply an outcome to the page: the server's copy, or the step marked waiting to send. */
  const settle = useCallback((base: JobTask, to: string, outcome: ActionOutcome) => {
    if (outcome.kind === 'refused') throw new Error(refusalText(outcome));
    if (outcome.kind === 'done') {
      setTask((prev) => ({ ...(prev ?? base), ...(outcome.response as Task), pendingSync: false } as JobTask));
    } else {
      setTask((prev) => ({ ...(prev ?? base), status: to as Task['status'], pendingSync: true } as JobTask));
      toast.info(t('offline.savedForLater'));
    }
  }, [refusalText, setTask, toast, t]);

  /* ---------------- status ---------------- */

  const changeStatus = useCallback(async (to: string, reason?: string): Promise<boolean> => {
    if (!task) return false;
    const from = task.status;
    try {
      setBusy(true);
      trackRouteFor(tracking, task, from, to);
      const outcome = await writeStatus(task, to, reason);
      settle(task, to, outcome);
      pushLocalEvent({ eventType: 'STATUS_CHANGED', metadata: { oldStatus: from, newStatus: to, reason }, pendingSync: outcome.kind === 'queued' });
      refreshJobTime(task.id);
      // Blocked says its own sentence (reportIssue) — one island, not two.
      if (outcome.kind === 'done' && to !== TaskStatus.BLOCKED) toast.success(labelOf(to), task.title);
      return true;
    } catch (err) {
      // Put the route back the way it was.
      untrackRouteFor(tracking, task, from, to);
      fail(err instanceof Error && err.message ? err.message : t('taskDetail.failedToUpdateStatus'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [task, tracking, writeStatus, settle, pushLocalEvent, toast, labelOf, t, refreshJobTime]);

  const cancelJob = useCallback(async () => {
    const ok = await changeStatus(TaskStatus.CANCELED);
    return ok;
  }, [changeStatus]);

  /* ---------------- notes ---------------- */

  const addComment = useCallback(async (text: string): Promise<boolean> => {
    if (!task || !text.trim()) return false;
    const content = text.trim();
    try {
      setBusy(true);
      if (offline.engine) {
        // Saved on the phone first; shown at once, marked until the server has it.
        const { id: commentId, outcome } = await addTaskComment(offline.engine, { taskId: task.id, content });
        if (outcome.kind === 'refused') { fail(refusalText(outcome)); return false; }
        const saved = (outcome.kind === 'done' ? outcome.response : null) as any;
        setComments((prev) => [
          ...prev.filter((c) => c.id !== commentId),
          {
            ...(saved ?? {
              id: commentId,
              content,
              createdAt: new Date().toISOString(),
              user: { id: user?.id ?? '', firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' },
            }),
            pendingSync: outcome.kind === 'queued',
          },
        ]);
        if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
        return true;
      }
      const comment = await tasksApi.addComment(task.id, content);
      setComments((prev) => [...prev, comment]);
      return true;
    } catch (err) {
      fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToAddComment'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [task, offline.engine, refusalText, setComments, toast, t, user?.id, user?.firstName, user?.lastName]);

  /* ---------------- photos & files ---------------- */

  /*
    The server's attachments with the member's held photos laid on top. Held
    photos point at the copy on this phone; once one is accepted its copy is
    deleted, so the list is re-read then.
  */
  const refreshAttachments = useCallback(async (taskId: string) => {
    const held = offline.files
      ? pendingAttachments(taskId, offline.engine?.operations() ?? [], (fileId, mime) => offline.files!.uriFor(fileId, mime))
      : [];
    let server: any[] | null = null;
    try {
      server = (await taskAttachmentsApi.getAttachments(taskId)) || [];
    } catch {
      // Offline: keep what the page already had from the server.
    }
    setAttachments((prev) => mergeAttachments(server ?? prev.filter((a: any) => !a.pendingSync), held));
  }, [offline.engine, offline.files, setAttachments]);

  // A held photo sent in the background: swap the phone's copy for the server's.
  useEffect(() => {
    const engine = offline.engine;
    if (!engine || !task?.id) return;
    const taskId = task.id;
    const sent = new Set(engine.operations().filter((o) => o.op === 'task.attachment' && o.state === 'done').map((o) => o.id));
    return engine.subscribe((_snap, ops) => {
      let changed = false;
      for (const o of ops) {
        if (o.op !== 'task.attachment' || o.entityId !== taskId || o.state !== 'done' || sent.has(o.id)) continue;
        sent.add(o.id);
        changed = true;
      }
      if (changed) void refreshAttachments(taskId);
    });
  }, [offline.engine, task?.id, refreshAttachments]);

  /**
   * ONE file onto the job — queued where a queue exists (kept on the phone,
   * sent when there is a signal), uploaded directly otherwise. A `data:` URL
   * is a signature the pad drew. Returns the attachment's id and, while it is
   * still unsent, the operation a move naming it must wait for.
   */
  const sendFile = useCallback(async (taskId: string, photo: DraftPhoto): Promise<{ id: string | null; waitFor: string | null; outcome: ActionOutcome }> => {
    if (offline.engine && offline.files) {
      const sent = await addTaskPhoto(offline.engine, offline.files, {
        taskId,
        fileName: photo.fileName,
        mime: photo.mimeType,
        width: photo.width,
        height: photo.height,
        ...(photo.uri.startsWith('data:') ? { base64: photo.uri, kind: 'signature' as const } : { uri: photo.uri }),
      });
      return { id: sent.id, waitFor: sent.state === 'done' ? null : sent.opId, outcome: sent.outcome };
    }
    const { uploadUrl, fileKey, fileUrl } = await taskAttachmentsApi.getPresignedUrl(taskId, photo.fileName, photo.mimeType);
    await uploadToPresignedUrl(uploadUrl, photo.uri, photo.mimeType, () => undefined);
    const saved = await taskAttachmentsApi.confirmUpload(taskId, {
      fileName: photo.fileName, fileKey, fileUrl, fileType: photo.mimeType, fileSize: photo.fileSize,
    });
    return { id: typeof saved?.id === 'string' ? saved.id : null, waitFor: null, outcome: { kind: 'done', response: saved } };
  }, [offline.engine, offline.files]);

  const photoRefused = (outcome: { code?: string; message?: string }) =>
    (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('offline.errors.PHOTO_REFUSED');

  const addPhotos = useCallback(async (photos: PickedImage[]) => {
    if (!task || photos.length === 0) return;
    setUploading(true);
    let queued = false;
    for (const photo of photos) {
      try {
        const { outcome } = await sendFile(task.id, photo);
        if (outcome.kind === 'refused') fail(t('common.error'), photoRefused(outcome));
        if (outcome.kind === 'queued') queued = true;
      } catch {
        fail(t('common.error'), t('offline.errors.PHOTO_NOT_KEPT'));
      }
    }
    if (queued) toast.info(t('offline.savedForLater'));
    pushLocalEvent({ eventType: 'ATTACHMENT_ADDED', metadata: { count: photos.length }, pendingSync: queued });
    await refreshAttachments(task.id);
    setUploading(false);
  }, [task, sendFile, toast, t, pushLocalEvent, refreshAttachments]);

  /** A signature drawn at a step, kept as a picture on the job. */
  const addSignature = useCallback(async (png: string) => {
    await addPhotos([signatureFile(png) as PickedImage]);
  }, [addPhotos]);

  const deleteAttachment = useCallback(async (attachmentId: string) => {
    if (!task) return;
    try {
      await taskAttachmentsApi.delete(task.id, attachmentId);
      setAttachments((prev) => prev.filter((a: any) => a.id !== attachmentId));
    } catch (err) {
      fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToDelete'));
    }
  }, [task, setAttachments, toast, t]);

  /* ---------------- decline ---------------- */

  const decline = useCallback(async () => {
    if (!task) return;
    try {
      setBusy(true);
      if (offline.engine) {
        const outcome = await declineTask(offline.engine, { taskId: task.id });
        if (outcome.kind === 'refused') { fail(t('common.error'), refusalText(outcome)); return; }
        if (outcome.kind === 'queued') { toast.info(t('offline.savedForLater')); onClosed(); return; }
      } else {
        await tasksApi.declineTask(task.id);
      }
      toast.info(t('taskDetail.declineTask.successTitle'), t('taskDetail.declineTask.successMessage'));
      onClosed();
    } catch (err) {
      fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToDecline'));
    } finally {
      setBusy(false);
    }
  }, [task, offline.engine, refusalText, toast, t, onClosed]);

  /* ---------------- report an issue ---------------- */

  const reportIssue = useCallback(async (reason: string, photos: PickedImage[]): Promise<boolean> => {
    const ok = await changeStatus(TaskStatus.BLOCKED, reason);
    if (ok && photos.length) await addPhotos(photos);
    if (ok) toast.warning(t('job.issue.sentTitle'), t('job.issue.sentBody'));
    return ok;
  }, [changeStatus, addPhotos, toast, t]);

  /* ---------------- paused at a clock-out ---------------- */

  /**
   * "Resume work" on a job paused at a clock-out — queued where a queue exists.
   * The page asks for the clock-in first (the server holds it to the same gate).
   */
  const resume = useCallback(async (): Promise<boolean> => {
    if (!task) return false;
    try {
      setBusy(true);
      if (offline.engine) {
        const outcome = await resumeJob(offline.engine, { taskId: task.id });
        if (outcome.kind === 'refused') { fail(refusalText(outcome)); return false; }
        setTask((prev) => ({ ...(prev ?? task), pausedAt: null, pausedById: null, pendingSync: outcome.kind === 'queued' } as JobTask));
        if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      } else {
        await tasksApi.resumeWork(task.id);
        setTask((prev) => ({ ...(prev ?? task), pausedAt: null, pausedById: null } as JobTask));
      }
      pushLocalEvent({ eventType: 'RESUMED', metadata: {}, pendingSync: false });
      refreshHandovers();
      refreshJobTime(task.id);
      toast.success(t('job.handover.resumed'), task.title);
      return true;
    } catch (err) {
      fail(err instanceof Error && err.message ? err.message : t('common.error'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [task, offline.engine, refusalText, setTask, pushLocalEvent, toast, t, refreshHandovers, refreshJobTime]);

  /**
   * "What I did, and what is left." The photos go onto the job first (queued
   * like any other); the note names them and waits for them to land.
   */
  const handover = useCallback(async (note: string, photos: PickedImage[]): Promise<boolean> => {
    if (!task || !note.trim()) return false;
    try {
      setBusy(true);
      const ids: string[] = [];
      const waitFor: string[] = [];
      for (const photo of photos) {
        const sent = await sendFile(task.id, photo);
        if (sent.outcome.kind === 'refused') { fail(t('common.error'), photoRefused(sent.outcome)); continue; }
        if (sent.id) ids.push(sent.id);
        if (sent.waitFor) waitFor.push(sent.waitFor);
      }
      let queued = false;
      let saved: any = null;
      if (offline.engine) {
        const { id, outcome } = await writeHandover(offline.engine, { taskId: task.id, note, attachmentIds: ids, dependsOn: waitFor });
        if (outcome.kind === 'refused') { fail(refusalText(outcome)); return false; }
        queued = outcome.kind === 'queued';
        saved = outcome.kind === 'done' ? outcome.response : {
          id, note, attachmentIds: ids, workedMinutes: null, createdAt: new Date().toISOString(),
          author: { id: user?.id ?? '', firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' },
        };
      } else {
        saved = await tasksApi.writeHandover(task.id, { note, attachmentIds: ids });
      }
      setTask((prev) => {
        const base = (prev ?? task) as JobTask;
        return {
          ...base,
          handovers: [saved, ...(base.handovers ?? []).filter((h) => h.id !== saved.id)],
          handoverDueById: base.handoverDueById === user?.id ? null : base.handoverDueById,
          handoverDue: base.handoverDueById === user?.id ? null : base.handoverDue,
        } as JobTask;
      });
      if (photos.length) await refreshAttachments(task.id);
      refreshHandovers();
      if (queued) toast.info(t('offline.savedForLater'));
      else toast.success(t('job.handover.saved'), task.title);
      return true;
    } catch (err) {
      fail(t('common.error'), err instanceof Error ? err.message : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }, [task, sendFile, offline.engine, refusalText, setTask, refreshAttachments, toast, t, user?.id, user?.firstName, user?.lastName, refreshHandovers]);

  /* ---------------- a step with a form ---------------- */

  /*
    Files already sent for the sheet that is open, by the picture they are —
    a move refused for a missing name must not upload the same six photos
    again when it is sent a second time. Cleared once a move goes through.
  */
  const sentFiles = useRef(new Map<string, { id: string; waitFor: string | null }>());

  /**
   * Move the job into a step whose form asks something.
   *
   * ⚠️ FILES FIRST, THEN THE MOVE, IN THE JOB'S LANE. Every photo and each
   * inked signature is queued as an attachment of the job (`addTaskPhoto`,
   * a phone-made id); those ids ARE the answers; the status change carries
   * them and waits for any file still unsent. Through the ONE status write
   * (`writeStatus`, from the screen) — never a second road.
   *
   * A refusal of the answers (`STEP_FORM_INVALID`, `STEP_FORM_FOREIGN_FILE`)
   * comes back as field errors, so the sheet stays open on them.
   */
  const moveWithForm = useCallback(async (
    to: string,
    form: StepForm,
    draft: FormDraft,
    signatures: Record<string, string>,
  ): Promise<FormMoveResult> => {
    if (!task) return { ok: false };
    const from = task.status;
    let tracked = false;
    try {
      setBusy(true);
      const prepared = await prepareStepForm({
        form, draft, signatures,
        sent: sentFiles.current,
        send: (file) => sendFile(task.id, file),
      });
      if (!prepared.ok) {
        if (prepared.refused) fail(t('common.error'), photoRefused(prepared.refused));
        return { ok: false, fieldErrors: prepared.fieldErrors };
      }
      const { answers, dependsOn, queuedFiles } = prepared;

      trackRouteFor(tracking, task, from, to);
      tracked = true;
      const reason = to === TaskStatus.BLOCKED ? reasonFromAnswers(form, answers) : undefined;
      const outcome = await writeStatus(task, to, reason, { answers, ...(dependsOn.length ? { dependsOn } : {}) });
      if (outcome.kind === 'refused') {
        untrackRouteFor(tracking, task, from, to);
        tracked = false;
        const fieldErrors = refusalFieldErrors(outcome, answers);
        fail(refusalText(outcome));
        return { ok: false, ...(fieldErrors ? { fieldErrors } : {}) };
      }
      settle(task, to, outcome);
      sentFiles.current.clear();
      pushLocalEvent({ eventType: 'STATUS_CHANGED', metadata: { oldStatus: from, newStatus: to, reason }, pendingSync: outcome.kind === 'queued' });
      refreshJobTime(task.id);
      if (outcome.kind === 'done') toast.success(labelOf(to), task.title);
      // The photos and signatures are the job's files too.
      if (form.fields.some((f) => (f.type === 'photos' || f.type === 'signature') && answers[f.id] !== undefined)) {
        await refreshAttachments(task.id);
      }
      if (outcome.kind === 'done' && !queuedFiles) reloadSubmissions();
      return { ok: true };
    } catch (err) {
      if (tracked) untrackRouteFor(tracking, task, from, to);
      fail(err instanceof Error && err.message ? err.message : t('taskDetail.failedToUpdateStatus'));
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [task, tracking, writeStatus, sendFile, settle, pushLocalEvent, refreshAttachments, reloadSubmissions, refusalText, toast, labelOf, t, refreshJobTime]);

  /** A sheet opened afresh starts with nothing sent. */
  const resetFormFiles = useCallback(() => sentFiles.current.clear(), []);

  /* ---------------- overseeing ---------------- */

  const assign = useCallback(async (member: Member): Promise<boolean> => {
    if (!task) return false;
    try {
      setBusy(true);
      const updated = await tasksApi.assign(task.id, member.id);
      setTask((prev) => ({ ...(prev ?? task), ...updated } as JobTask));
      toast.success(t('job.assign.doneTitle'), t('job.assign.doneBody', { name: personName(member) }));
      return true;
    } catch (err) {
      fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToAssign'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [task, setTask, toast, t]);

  const edit = useCallback(async (input: UpdateTaskInput): Promise<boolean> => {
    if (!task) return false;
    try {
      setBusy(true);
      const updated = await tasksApi.update(task.id, input);
      setTask((prev) => ({ ...(prev ?? task), ...updated } as JobTask));
      toast.success(t('job.edit.doneTitle'), input.title ?? task.title);
      return true;
    } catch (err) {
      fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToUpdate'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [task, setTask, toast, t]);

  return {
    busy, uploading,
    notice, clearNotice: () => setNotice(null),
    changeStatus, cancelJob, addComment, addPhotos, addSignature, deleteAttachment,
    decline, reportIssue, moveWithForm, resetFormFiles, assign, edit, refreshAttachments,
    resume, handover,
  };
}
