import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tasksApi, taskAttachmentsApi, uploadToPresignedUrl, TaskStatus, type Task } from '../../lib/api';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { useOffline } from '../../offline/offline-context';
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
      const { uploadUrl, fileKey, fileUrl } = await taskAttachmentsApi.getPresignedUrl(
        taskId,
        photo.fileName,
        photo.mimeType,
      );
      await uploadToPresignedUrl(uploadUrl, photo.uri, photo.mimeType, () => undefined);
      const saved = await taskAttachmentsApi.confirmUpload(taskId, {
        fileName: photo.fileName,
        fileKey,
        fileUrl,
        fileType: photo.mimeType,
        fileSize: photo.fileSize,
      });
      return {
        id: typeof saved?.id === 'string' ? saved.id : null,
        waitFor: null,
        outcome: { kind: 'done', response: saved },
      };
    },
    [offline.engine, offline.files],
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
        setAttachments((prev) => prev.filter((a: any) => a.id !== attachmentId));
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
      if (offline.engine) {
        const outcome = await declineTask(offline.engine, { taskId: task.id });
        if (outcome.kind === 'refused') {
          fail(t('common.error'), refusalText(outcome));
          return;
        }
        if (outcome.kind === 'queued') {
          toast.info(t('offline.savedForLater'));
          onClosed();
          return;
        }
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
