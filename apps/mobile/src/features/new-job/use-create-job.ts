import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tasksApi, taskAttachmentsApi, uploadToPresignedUrl, type CreateTaskInput } from '@/lib/api';
import type { PickedImage } from '@/hooks/use-image-picker';
import { useToast } from '@/island/island-context';
import { useOffline } from '@/offline/offline-context';
import { createFromPhone } from '@/offline/actions/queued-create';
import { useQueuedWrite } from '@/offline/actions/queued-write';
import { keepCreated } from '@/offline/actions/keep-created';
import { addTaskPhoto } from '@/offline/tasks/task-actions';
import { uuidv7 } from '@/offline/ids';

/** What happened to a New job: on the server (open it), saved for later, or refused. */
type CreateResult = { kind: 'created'; id: string } | { kind: 'queued' } | { kind: 'failed' };

/**
 * A New job's photo with no outbox: presign → PUT → confirm, as it always was
 * — the fallback each photo hands `write.run`. Three calls, so the guard
 * counts the confirm (`queued-writes-guard.spec`).
 */
async function uploadPhotoDirect(taskId: string, photo: PickedImage) {
  const presign = await taskAttachmentsApi.getPresignedUrl(taskId, photo.fileName, photo.mimeType);
  if (!presign?.uploadUrl) return null;
  await uploadToPresignedUrl(presign.uploadUrl, photo.uri, photo.mimeType);
  return taskAttachmentsApi.confirmUpload(taskId, {
    fileName: photo.fileName,
    fileUrl: presign.fileUrl,
    fileType: photo.mimeType,
    fileSize: photo.fileSize,
  });
}

/**
 * Sending a New job — unchanged from the tab it replaces.
 *
 * ⚠️ QUEUED WHERE A QUEUE EXISTS. Saved on the phone first under the id it
 * will have on the server (`createFromPhone`, `task.create`), and each photo
 * follows in the task's lane, waiting for the task to exist before it asks
 * for an upload link. The direct calls are only the path for a build without
 * the offline layer (`queued-writes-guard.spec` counts them).
 */
export function useCreateJob() {
  const { t } = useTranslation();
  const toast = useToast();
  const offline = useOffline();
  const write = useQueuedWrite();
  const [submitting, setSubmitting] = useState(false);

  const create = useCallback(
    async (input: CreateTaskInput, photos: PickedImage[]): Promise<CreateResult> => {
      try {
        setSubmitting(true);
        const files = offline.files; // starts with the engine — there whenever `write.run` queues
        const minted = uuidv7();
        const created = keepCreated<Awaited<ReturnType<typeof createFromPhone>>>();
        const outcome = await write.run(
          (engine) =>
            created.from(
              createFromPhone(engine, {
                op: 'task.create',
                id: minted,
                lane: `task:${minted}`,
                entityId: minted,
                body: input as unknown as Record<string, unknown>,
              }),
            ),
          () => tasksApi.create(input),
        );
        if (outcome.kind === 'refused') {
          toast.error(
            t('common.error'),
            (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
              outcome.message ||
              t('createTask.failedToCreate'),
          );
          return { kind: 'failed' };
        }
        // The phone's id where it was queued; the server's where it went straight there.
        const queuedOp = created.value;
        const taskId = !queuedOp && outcome.kind === 'done' ? (outcome.response as { id: string }).id : minted;
        for (const photo of photos) {
          // Each photo follows in the task's lane, waiting for the task; directly, a failed one is skipped.
          await write
            .run(
              (engine) =>
                addTaskPhoto(engine, files!, {
                  taskId,
                  fileName: photo.fileName,
                  mime: photo.mimeType,
                  width: photo.width,
                  height: photo.height,
                  uri: photo.uri,
                  dependsOn: queuedOp && queuedOp.state !== 'done' ? [queuedOp.opId] : [],
                }).then((sent) => sent.outcome),
              () => uploadPhotoDirect(taskId, photo),
            )
            .catch(() => undefined);
        }
        if (outcome.kind === 'queued') {
          // Not on the server yet, so there is no job page to open.
          toast.info(t('offline.savedForLater'));
          return { kind: 'queued' };
        }
        toast.success(t('newJob.doneTitle'), input.title);
        return { kind: 'created', id: taskId };
      } catch (err) {
        toast.error(t('common.error'), err instanceof Error ? err.message : t('createTask.failedToCreate'));
        return { kind: 'failed' };
      } finally {
        setSubmitting(false);
      }
    },
    [write, offline.files, toast, t],
  );

  return { create, submitting };
}
