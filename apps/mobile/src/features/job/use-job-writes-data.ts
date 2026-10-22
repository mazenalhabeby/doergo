import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tasksApi, taskAttachmentsApi, uploadToPresignedUrl, TaskStatus, type Task } from '../../lib/api';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { keepCreated } from '../../offline/actions/keep-created';
import { useRefreshMyHandovers } from '../../hooks/useMyHandovers';
import { useRefreshJobTime } from '../../hooks/useJobTime';
import { mergeAttachments, pendingAttachments } from '../../offline/tasks/overlay';
import { addTaskComment, addTaskPhoto, declineTask, type ActionOutcome } from '../../offline/tasks/task-actions';
import type { PickedImage } from '../../hooks/useImagePicker';
import type { JobState, JobTask } from './use-job';
import { refusalText } from '../../lib/distance';
import { signatureFile, type DraftPhoto } from './step-form-logic';
import { type WriteStatus, type Translate, refusalMessage, trackRouteFor, untrackRouteFor } from './job-writes-helpers';
import { useJobWritesState } from './use-job-writes-state';

/**
 * A file onto the job with no outbox: presign → PUT → confirm, as it always
 * was. The fallback `sendFile` hands `write.run` — three calls, so the guard
 * counts its confirm (`queued-writes-guard.spec`).
 */
async function uploadDirect(taskId: string, photo: DraftPhoto) {
  const { uploadUrl, fileKey, fileUrl } = await taskAttachmentsApi.getPresignedUrl(
    taskId,
    photo.fileName,
    photo.mimeType,
  );
  await uploadToPresignedUrl(uploadUrl, photo.uri, photo.mimeType, () => undefined);
  return taskAttachmentsApi.confirmUpload(taskId, {
    fileName: photo.fileName,
    fileKey,
    fileUrl,
    fileType: photo.mimeType,
    fileSize: photo.fileSize,
  });
}

/** useJobWrites's state and handlers — everything before its markup, moved here unchanged. */
export function useJobWritesData(
  job: JobState,
  deps: { writeStatus: WriteStatus; onClosed: () => void; labelOf: (key: string) => string },
) {
  const {
    t,
    toast,
    user,
    offline,
    refreshHandovers,
    refreshJobTime,
    task,
    setTask,
    setAttachments,
    pushLocalEvent,
    tracking,
    reloadSubmissions,
    writeStatus,
    onClosed,
    labelOf,
    busy,
    setBusy,
    uploading,
    setUploading,
    notice,
    setNotice,
    fail,
    refusalText,
    settle,
    changeStatus,
    cancelJob,
    addComment,
    refreshAttachments,
  } = useJobWritesState(job, deps);
  const write = useQueuedWrite();

  // A held photo sent in the background: swap the phone's copy for the server's.
  useEffect(() => {
    const engine = offline.engine;
    if (!engine || !task?.id) return;
    const taskId = task.id;
    const sent = new Set(
      engine
        .operations()
        .filter((o) => o.op === 'task.attachment' && o.state === 'done')
        .map((o) => o.id),
    );
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
  const sendFile = useCallback(
    async (
      taskId: string,
      photo: DraftPhoto,
    ): Promise<{ id: string | null; waitFor: string | null; outcome: ActionOutcome }> => {
      // The engine and the file store start together; `files` is there whenever there is an engine.
      const files = offline.files;
      const sent = keepCreated<Awaited<ReturnType<typeof addTaskPhoto>>>();
      const outcome = await write.run(
        (engine) =>
          sent.from(
            addTaskPhoto(engine, files!, {
              taskId,
              fileName: photo.fileName,
              mime: photo.mimeType,
              width: photo.width,
              height: photo.height,
              ...(photo.uri.startsWith('data:')
                ? { base64: photo.uri, kind: 'signature' as const }
                : { uri: photo.uri }),
            }),
          ),
        () => uploadDirect(taskId, photo),
      );
      if (sent.value) {
        return { id: sent.value.id, waitFor: sent.value.state === 'done' ? null : sent.value.opId, outcome };
      }
      const saved = outcome.kind === 'done' ? (outcome.response as { id?: unknown } | null) : null;
      return { id: typeof saved?.id === 'string' ? saved.id : null, waitFor: null, outcome };
    },
    [write, offline.files],
  );

  const photoRefused = (outcome: { code?: string; message?: string }) =>
    (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
    outcome.message ||
    t('offline.errors.PHOTO_REFUSED');

  const addPhotos = useCallback(
    async (photos: PickedImage[]) => {
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
    },
    [task, sendFile, toast, t, pushLocalEvent, refreshAttachments],
  );

  /** A signature drawn at a step, kept as a picture on the job. */
  const addSignature = useCallback(
    async (png: string) => {
      await addPhotos([signatureFile(png) as PickedImage]);
    },
    [addPhotos],
  );

  const deleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (!task) return;
      try {
        await taskAttachmentsApi.delete(task.id, attachmentId);
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      } catch (err) {
        fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToDelete'));
      }
    },
    [task, setAttachments, toast, t],
  );

  /* ---------------- decline ---------------- */

  const decline = useCallback(async () => {
    if (!task) return;
    try {
      setBusy(true);
      const outcome = await write.run(
        (engine) => declineTask(engine, { taskId: task.id }),
        () => tasksApi.declineTask(task.id),
      );
      if (outcome.kind === 'refused') {
        fail(t('common.error'), refusalText(outcome));
        return;
      }
      if (outcome.kind === 'queued') {
        toast.info(t('offline.savedForLater'));
        onClosed();
        return;
      }
      toast.info(t('taskDetail.declineTask.successTitle'), t('taskDetail.declineTask.successMessage'));
      onClosed();
    } catch (err) {
      fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToDecline'));
    } finally {
      setBusy(false);
    }
  }, [task, write, refusalText, toast, t, onClosed]);

  return {
    t,
    toast,
    user,
    offline,
    refreshHandovers,
    refreshJobTime,
    task,
    setTask,
    pushLocalEvent,
    tracking,
    reloadSubmissions,
    writeStatus,
    labelOf,
    busy,
    setBusy,
    uploading,
    notice,
    setNotice,
    fail,
    refusalText,
    settle,
    changeStatus,
    cancelJob,
    addComment,
    refreshAttachments,
    sendFile,
    photoRefused,
    addPhotos,
    addSignature,
    deleteAttachment,
    decline,
  };
}
