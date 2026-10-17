import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StepForm, StepFormAnswers } from '@hbcfield/shared/client';
import {
  tasksApi,
  taskAttachmentsApi,
  uploadToPresignedUrl,
  TaskStatus,
  type Task,
  type UpdateTaskInput,
} from '../../lib/api';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { useOffline } from '../../offline/offline-context';
import { useRefreshMyHandovers } from '../../hooks/useMyHandovers';
import { useRefreshJobTime } from '../../hooks/useJobTime';
import { mergeAttachments, pendingAttachments } from '../../offline/tasks/overlay';
import {
  addTaskComment,
  addTaskPhoto,
  declineTask,
  resumeJob,
  writeHandover,
  type ActionOutcome,
} from '../../offline/tasks/task-actions';
import { taskDestination } from '../../offline/tasks/status-fix';
import type { PickedImage } from '../../hooks/useImagePicker';
import type { JobState, JobTask } from './use-job';
import { refusalText } from '../../lib/distance';
import {
  prepareStepForm,
  reasonFromAnswers,
  signatureFile,
  refusalFieldErrors,
  type DraftPhoto,
  type FormDraft,
} from './step-form-logic';
import { personName } from '@hbcfield/shared/client';
import {
  type WriteStatus,
  type FormMoveResult,
  type Member,
  type Translate,
  refusalMessage,
  trackRouteFor,
  untrackRouteFor,
} from './job-writes-helpers';
import { useJobWritesData } from './use-job-writes-data';
import { useJobWritesActions } from './use-job-writes-actions';
export {
  type WriteStatus,
  type Member,
  refusalMessage,
  trackRouteFor,
  untrackRouteFor,
  type StatusExtras,
} from './job-writes-helpers';

/**
 * Everything the job page WRITES.
 *
 * ⚠️ QUEUED WHERE A QUEUE EXISTS. Comments, photos, status (with a step
 * form's answers) and decline go through the offline engine first; the direct API call is
 * only the path for a build without it (`queued-writes-guard.spec` counts
 * them). Assign, edit, a checklist tick and deleting a file have no outbox
 * operation, so they are direct — and the page disables them with no signal.
 */
export function useJobWrites(
  job: JobState,
  deps: { writeStatus: WriteStatus; onClosed: () => void; labelOf: (key: string) => string },
) {
  const {
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
  } = useJobWritesActions(job, deps);

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
  const moveWithForm = useCallback(
    async (
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
          form,
          draft,
          signatures,
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
        pushLocalEvent({
          eventType: 'STATUS_CHANGED',
          metadata: { oldStatus: from, newStatus: to, reason },
          pendingSync: outcome.kind === 'queued',
        });
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
    },
    [
      task,
      tracking,
      writeStatus,
      sendFile,
      settle,
      pushLocalEvent,
      refreshAttachments,
      reloadSubmissions,
      refusalText,
      toast,
      labelOf,
      t,
      refreshJobTime,
    ],
  );

  /** A sheet opened afresh starts with nothing sent. */
  const resetFormFiles = useCallback(() => sentFiles.current.clear(), []);

  /* ---------------- overseeing ---------------- */

  const assign = useCallback(
    async (member: Member): Promise<boolean> => {
      if (!task) return false;
      try {
        setBusy(true);
        const updated = await tasksApi.assign(task.id, member.id);
        setTask((prev) => ({ ...(prev ?? task), ...updated }) as JobTask);
        toast.success(t('job.assign.doneTitle'), t('job.assign.doneBody', { name: personName(member) }));
        return true;
      } catch (err) {
        fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToAssign'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [task, setTask, toast, t],
  );

  const edit = useCallback(
    async (input: UpdateTaskInput): Promise<boolean> => {
      if (!task) return false;
      try {
        setBusy(true);
        const updated = await tasksApi.update(task.id, input);
        setTask((prev) => ({ ...(prev ?? task), ...updated }) as JobTask);
        toast.success(t('job.edit.doneTitle'), input.title ?? task.title);
        return true;
      } catch (err) {
        fail(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToUpdate'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [task, setTask, toast, t],
  );

  return {
    busy,
    uploading,
    notice,
    clearNotice: () => setNotice(null),
    changeStatus,
    cancelJob,
    addComment,
    addPhotos,
    addSignature,
    deleteAttachment,
    decline,
    reportIssue,
    moveWithForm,
    resetFormFiles,
    assign,
    edit,
    refreshAttachments,
    resume,
    handover,
  };
}
