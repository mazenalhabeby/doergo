import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tasksApi, taskAttachmentsApi, TaskStatus, type Comment, type Task } from '@/lib/api';
import type { DetailAttachment } from '@/lib/api/types';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/island/island-context';
import { useOffline } from '@/offline/offline-context';
import { useQueuedWrite } from '@/offline/actions/queued-write';
import { keepCreated } from '@/offline/actions/keep-created';
import { useRefreshMyHandovers } from '@/hooks/use-my-handovers';
import { useRefreshJobTime } from '@/hooks/use-job-time';
import { mergeAttachments, pendingAttachments } from '@/offline/tasks/overlay';
import { addTaskComment, type ActionOutcome } from '@/offline/tasks/task-actions';
import type { JobState, JobTask } from './use-job';
import { refusalText } from '@/lib/distance';
import { type WriteStatus, type Translate, refusalMessage, trackRouteFor, untrackRouteFor } from './job-writes-helpers';

/** useJobWritesData's state and handlers — everything before its markup, moved here unchanged. */
export function useJobWritesState(
  job: JobState,
  deps: { writeStatus: WriteStatus; onClosed: () => void; labelOf: (key: string) => string },
) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const offline = useOffline();
  const write = useQueuedWrite();
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
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );
  const fail = (title: string, body?: string) => {
    setNotice(body || title);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 8000);
    toast.error(title, body);
  };

  /** A refusal in the member's language: the server's code first, its message second. */
  const refusalText = useCallback(
    (o: { code?: string; message?: string; conflict?: boolean }) => refusalMessage(t as Translate, o),
    [t],
  );

  /** Apply an outcome to the page: the server's copy, or the step marked waiting to send. */
  const settle = useCallback(
    (base: JobTask, to: string, outcome: ActionOutcome) => {
      if (outcome.kind === 'refused') throw new Error(refusalText(outcome));
      if (outcome.kind === 'done') {
        setTask((prev) => ({ ...(prev ?? base), ...(outcome.response as Task), pendingSync: false }) as JobTask);
      } else {
        setTask((prev) => ({ ...(prev ?? base), status: to as Task['status'], pendingSync: true }) as JobTask);
        toast.info(t('offline.savedForLater'));
      }
    },
    [refusalText, setTask, toast, t],
  );

  /* ---------------- status ---------------- */

  const changeStatus = useCallback(
    async (to: string, reason?: string): Promise<boolean> => {
      if (!task) return false;
      const from = task.status;
      try {
        setBusy(true);
        trackRouteFor(tracking, task, from, to);
        const outcome = await writeStatus(task, to, reason);
        settle(task, to, outcome);
        pushLocalEvent({
          eventType: 'STATUS_CHANGED',
          metadata: { oldStatus: from, newStatus: to, reason },
          pendingSync: outcome.kind === 'queued',
        });
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
    },
    [task, tracking, writeStatus, settle, pushLocalEvent, toast, labelOf, t, refreshJobTime],
  );

  const cancelJob = useCallback(async () => {
    const ok = await changeStatus(TaskStatus.CANCELED);
    return ok;
  }, [changeStatus]);

  /* ---------------- notes ---------------- */

  const addComment = useCallback(
    async (text: string): Promise<boolean> => {
      if (!task || !text.trim()) return false;
      const content = text.trim();
      try {
        setBusy(true);
        // Saved on the phone first where there is an outbox; shown at once, marked until the server has it.
        const sent = keepCreated();
        const outcome = await write.run(
          (engine) => sent.from(addTaskComment(engine, { taskId: task.id, content })),
          () => tasksApi.addComment(task.id, content),
        );
        // The phone's id for it — none when the direct call ran (the server's copy is the response).
        const commentId = sent.value?.id ?? '';
        if (outcome.kind === 'refused') {
          fail(refusalText(outcome));
          return false;
        }
        // The server's copy of the comment when it was sent now.
        const saved = (outcome.kind === 'done' ? outcome.response : null) as Comment | null;
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
      } catch (err) {
        fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToAddComment'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [task, write, refusalText, setComments, toast, t, user?.id, user?.firstName, user?.lastName],
  );

  /* ---------------- photos & files ---------------- */

  /*
    The server's attachments with the member's held photos laid on top. Held
    photos point at the copy on this phone; once one is accepted its copy is
    deleted, so the list is re-read then.
  */
  const refreshAttachments = useCallback(
    async (taskId: string) => {
      const held = offline.files
        ? pendingAttachments(taskId, offline.engine?.operations() ?? [], (fileId, mime) =>
            offline.files!.uriFor(fileId, mime),
          )
        : [];
      let server: DetailAttachment[] | null = null;
      try {
        server = (await taskAttachmentsApi.getAttachments(taskId)) || [];
      } catch {
        // Offline: keep what the page already had from the server.
      }
      setAttachments((prev) => mergeAttachments(server ?? prev.filter((a) => !a.pendingSync), held));
    },
    [offline.engine, offline.files, setAttachments],
  );

  return {
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
  };
}
