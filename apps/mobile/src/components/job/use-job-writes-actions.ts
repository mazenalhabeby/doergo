import { useCallback } from 'react';
import { tasksApi, TaskStatus } from '../../lib/api';
import { resumeJob, writeHandover } from '../../offline/tasks/task-actions';
import type { PickedImage } from '../../hooks/useImagePicker';
import type { JobState, JobTask } from './use-job';
import { refusalText } from '../../lib/distance';
import { type WriteStatus } from './job-writes-helpers';
import { useJobWritesData } from './use-job-writes-data';

/** useJobWrites's state and handlers — everything before its markup, moved here unchanged. */
/** One handover note as the task carries it. */
type Handover = NonNullable<JobTask['handovers']>[number];

export function useJobWritesActions(
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
  } = useJobWritesData(job, deps);

  /* ---------------- report an issue ---------------- */

  const reportIssue = useCallback(
    async (reason: string, photos: PickedImage[]): Promise<boolean> => {
      const ok = await changeStatus(TaskStatus.BLOCKED, reason);
      if (ok && photos.length) await addPhotos(photos);
      if (ok) toast.warning(t('job.issue.sentTitle'), t('job.issue.sentBody'));
      return ok;
    },
    [changeStatus, addPhotos, toast, t],
  );

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
        if (outcome.kind === 'refused') {
          fail(refusalText(outcome));
          return false;
        }
        setTask(
          (prev) =>
            ({
              ...(prev ?? task),
              pausedAt: null,
              pausedById: null,
              pendingSync: outcome.kind === 'queued',
            }) as JobTask,
        );
        if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      } else {
        await tasksApi.resumeWork(task.id);
        setTask((prev) => ({ ...(prev ?? task), pausedAt: null, pausedById: null }) as JobTask);
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
  const handover = useCallback(
    async (note: string, photos: PickedImage[]): Promise<boolean> => {
      if (!task || !note.trim()) return false;
      try {
        setBusy(true);
        const ids: string[] = [];
        const waitFor: string[] = [];
        for (const photo of photos) {
          const sent = await sendFile(task.id, photo);
          if (sent.outcome.kind === 'refused') {
            fail(t('common.error'), photoRefused(sent.outcome));
            continue;
          }
          if (sent.id) ids.push(sent.id);
          if (sent.waitFor) waitFor.push(sent.waitFor);
        }
        let queued = false;
        let saved: Handover;
        if (offline.engine) {
          const { id, outcome } = await writeHandover(offline.engine, {
            taskId: task.id,
            note,
            attachmentIds: ids,
            dependsOn: waitFor,
          });
          if (outcome.kind === 'refused') {
            fail(refusalText(outcome));
            return false;
          }
          queued = outcome.kind === 'queued';
          saved =
            outcome.kind === 'done'
              ? (outcome.response as Handover) // the server's copy of the note
              : {
                  id,
                  note,
                  attachmentIds: ids,
                  workedMinutes: null,
                  createdAt: new Date().toISOString(),
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
    },
    [
      task,
      sendFile,
      offline.engine,
      refusalText,
      setTask,
      refreshAttachments,
      toast,
      t,
      user?.id,
      user?.firstName,
      user?.lastName,
      refreshHandovers,
    ],
  );

  return {
    t,
    toast,
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
    reportIssue,
    resume,
    handover,
  };
}
