import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  tasksApi, reportsApi, reportAttachmentsApi, taskAttachmentsApi, uploadToPresignedUrl, TaskStatus,
  type CompleteTaskInput, type Task, type UpdateTaskInput,
} from '../../lib/api';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { useOffline } from '../../offline/offline-context';
import { mergeAttachments, pendingAttachments } from '../../offline/tasks/overlay';
import { addTaskComment, addTaskPhoto, completeTaskWithReport, declineTask, type ActionOutcome } from '../../offline/tasks/task-actions';
import { taskDestination } from '../../offline/tasks/status-fix';
import type { PickedImage } from '../../hooks/useImagePicker';
import type { JobState, JobTask } from './use-job';

/**
 * The one status write — `changeTaskStatus` through the outbox, with the GPS
 * fix taken by `takeStatusFix`. It lives on the SCREEN (`task/[id].tsx`) and is
 * handed in, so the screen stays the single place a status leaves the phone.
 */
export type WriteStatus = (task: Task, to: string, reason?: string) => Promise<ActionOutcome>;

export interface Member { id: string; firstName: string; lastName: string }

/**
 * Everything the job page WRITES.
 *
 * ⚠️ QUEUED WHERE A QUEUE EXISTS. Comments, photos, status, decline and the
 * finished report go through the offline engine first; the direct API call is
 * only the path for a build without it (`queued-writes-guard.spec` counts
 * them). Assign, edit, a checklist tick and deleting a file have no outbox
 * operation, so they are direct — and the page disables them with no signal.
 */
export function useJobWrites(job: JobState, deps: { writeStatus: WriteStatus; onClosed: () => void; labelOf: (key: string) => string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const offline = useOffline();
  const { task, setTask, setComments, setAttachments, pushLocalEvent, tracking, reload } = job;
  const { writeStatus, onClosed, labelOf } = deps;
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  /** A refusal in the member's language: the server's code first, its message second. */
  const refusalText = useCallback((o: { code?: string; message?: string; conflict?: boolean }) =>
    (o.code && t(`offline.errors.${o.code}`, { defaultValue: '' })) ||
    o.message ||
    t(o.conflict ? 'offline.errors.CONFLICT' : 'taskDetail.failedToUpdateStatus'), [t]);

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
      if (from === TaskStatus.EN_ROUTE && to === TaskStatus.ARRIVED) tracking.stopTracking();
      if (to === TaskStatus.EN_ROUTE) void tracking.startTracking(task.id, taskDestination(task));
      const outcome = await writeStatus(task, to, reason);
      settle(task, to, outcome);
      pushLocalEvent({ eventType: 'STATUS_CHANGED', metadata: { oldStatus: from, newStatus: to, reason }, pendingSync: outcome.kind === 'queued' });
      // Blocked says its own sentence (reportIssue) — one island, not two.
      if (outcome.kind === 'done' && to !== TaskStatus.BLOCKED) toast.success(labelOf(to), task.title);
      return true;
    } catch (err) {
      // Put the route back the way it was.
      if (from === TaskStatus.EN_ROUTE && to === TaskStatus.ARRIVED) void tracking.startTracking(task.id, taskDestination(task));
      if (to === TaskStatus.EN_ROUTE) tracking.stopTracking();
      toast.error(err instanceof Error && err.message ? err.message : t('taskDetail.failedToUpdateStatus'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [task, tracking, writeStatus, settle, pushLocalEvent, toast, labelOf, t]);

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
        if (outcome.kind === 'refused') { toast.error(refusalText(outcome)); return false; }
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
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToAddComment'));
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

  const addPhotos = useCallback(async (photos: PickedImage[]) => {
    if (!task || photos.length === 0) return;
    setUploading(true);
    let queued = false;
    for (const photo of photos) {
      try {
        if (offline.engine && offline.files) {
          // Kept on the phone first, sent when there is a connection.
          const { outcome } = await addTaskPhoto(offline.engine, offline.files, {
            taskId: task.id,
            fileName: photo.fileName,
            mime: photo.mimeType,
            width: photo.width,
            height: photo.height,
            ...(photo.uri.startsWith('data:') ? { base64: photo.uri, kind: 'signature' as const } : { uri: photo.uri }),
          });
          if (outcome.kind === 'refused') toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('offline.errors.PHOTO_REFUSED'));
          if (outcome.kind === 'queued') queued = true;
          continue;
        }
        const { uploadUrl, fileKey, fileUrl } = await taskAttachmentsApi.getPresignedUrl(task.id, photo.fileName, photo.mimeType);
        await uploadToPresignedUrl(uploadUrl, photo.uri, photo.mimeType, () => undefined);
        await taskAttachmentsApi.confirmUpload(task.id, {
          fileName: photo.fileName, fileKey, fileUrl, fileType: photo.mimeType, fileSize: photo.fileSize,
        });
      } catch {
        toast.error(t('common.error'), t('offline.errors.PHOTO_NOT_KEPT'));
      }
    }
    if (queued) toast.info(t('offline.savedForLater'));
    pushLocalEvent({ eventType: 'ATTACHMENT_ADDED', metadata: { count: photos.length }, pendingSync: queued });
    await refreshAttachments(task.id);
    setUploading(false);
  }, [task, offline.engine, offline.files, toast, t, pushLocalEvent, refreshAttachments]);

  /** A signature drawn at a step, kept as a picture on the job. */
  const addSignature = useCallback(async (png: string) => {
    await addPhotos([
      // ⚠️ `mimeType`, not `fileType`: the upload reads `photo.mimeType`.
      { uri: png, fileName: `signature_${Date.now()}.png`, mimeType: 'image/png', width: 600, height: 200, fileSize: 0 },
    ]);
  }, [addPhotos]);

  const deleteAttachment = useCallback(async (attachmentId: string) => {
    if (!task) return;
    try {
      await taskAttachmentsApi.delete(task.id, attachmentId);
      setAttachments((prev) => prev.filter((a: any) => a.id !== attachmentId));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToDelete'));
    }
  }, [task, setAttachments, toast, t]);

  /* ---------------- decline ---------------- */

  const decline = useCallback(async () => {
    if (!task) return;
    try {
      setBusy(true);
      if (offline.engine) {
        const outcome = await declineTask(offline.engine, { taskId: task.id });
        if (outcome.kind === 'refused') { toast.error(t('common.error'), refusalText(outcome)); return; }
        if (outcome.kind === 'queued') { toast.info(t('offline.savedForLater')); onClosed(); return; }
      } else {
        await tasksApi.declineTask(task.id);
      }
      toast.info(t('taskDetail.declineTask.successTitle'), t('taskDetail.declineTask.successMessage'));
      onClosed();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToDecline'));
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

  /* ---------------- finish the job ---------------- */

  const uploadReportPhotos = async (reportId: string, photos: PickedImage[], type: 'BEFORE' | 'AFTER') => {
    for (const photo of photos) {
      try {
        const { uploadUrl, fileKey, fileUrl } = await reportAttachmentsApi.getPresignedUrl(reportId, photo.fileName, photo.mimeType);
        await uploadToPresignedUrl(uploadUrl, photo.uri, photo.mimeType, () => undefined);
        // The key is what the server stores; `fileUrl` still goes along for a server that predates keys.
        await reportAttachmentsApi.confirmUpload(reportId, { type, fileName: photo.fileName, fileKey, fileUrl, fileType: photo.mimeType, fileSize: photo.fileSize });
      } catch {
        // A photo that did not upload does not undo the report.
      }
    }
  };

  const complete = useCallback(async (
    input: CompleteTaskInput,
    photos: { before: PickedImage[]; after: PickedImage[] },
  ): Promise<boolean> => {
    if (!task) return false;
    try {
      setBusy(true);
      if (offline.engine && offline.files) {
        // The report, then its photos behind it — saved on the phone first.
        const asPhoto = (side: 'BEFORE' | 'AFTER') => (p: PickedImage) => ({ uri: p.uri, fileName: p.fileName, mimeType: p.mimeType, width: p.width, height: p.height, side });
        const { outcome } = await completeTaskWithReport(offline.engine, offline.files, {
          taskId: task.id,
          report: input,
          photos: [...photos.before.map(asPhoto('BEFORE')), ...photos.after.map(asPhoto('AFTER'))],
        });
        if (outcome.kind === 'refused') { toast.error(t('common.error'), refusalText(outcome)); return false; }
        await reload();
        if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
        else toast.success(t('job.finish.doneTitle'), t('job.finish.doneBody'));
        return true;
      }
      const report = await reportsApi.completeTask(task.id, input);
      if (report?.id) {
        await Promise.all([uploadReportPhotos(report.id, photos.before, 'BEFORE'), uploadReportPhotos(report.id, photos.after, 'AFTER')]);
      }
      setTask(await tasksApi.getById(task.id) as JobTask);
      toast.success(t('job.finish.doneTitle'), t('job.finish.doneBody'));
      return true;
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToComplete'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [task, offline.engine, offline.files, refusalText, reload, setTask, toast, t]);

  /* ---------------- overseeing ---------------- */

  const assign = useCallback(async (member: Member): Promise<boolean> => {
    if (!task) return false;
    try {
      setBusy(true);
      const updated = await tasksApi.assign(task.id, member.id);
      setTask((prev) => ({ ...(prev ?? task), ...updated } as JobTask));
      toast.success(t('job.assign.doneTitle'), t('job.assign.doneBody', { name: `${member.firstName} ${member.lastName}`.trim() }));
      return true;
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToAssign'));
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
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToUpdate'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [task, setTask, toast, t]);

  return {
    busy, uploading,
    changeStatus, cancelJob, addComment, addPhotos, addSignature, deleteAttachment,
    decline, reportIssue, complete, assign, edit, refreshAttachments,
  };
}

export type JobWrites = ReturnType<typeof useJobWrites>;
