import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tasksApi, taskAttachmentsApi, uploadToPresignedUrl, type CreateTaskInput } from '../../lib/api';
import type { PickedImage } from '../../hooks/useImagePicker';
import { useToast } from '../../island/island-context';
import { useOffline } from '../../offline/offline-context';
import { createFromPhone } from '../../offline/actions/queued-create';
import { addTaskPhoto } from '../../offline/tasks/task-actions';
import { uuidv7 } from '../../offline/ids';

/** What happened to a New job: on the server (open it), saved for later, or refused. */
type CreateResult = { kind: 'created'; id: string } | { kind: 'queued' } | { kind: 'failed' };

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
  const [submitting, setSubmitting] = useState(false);

  const create = useCallback(async (input: CreateTaskInput, photos: PickedImage[]): Promise<CreateResult> => {
    try {
      setSubmitting(true);
      if (offline.engine && offline.files) {
        const taskId = uuidv7();
        const created = await createFromPhone(offline.engine, {
          op: 'task.create', id: taskId, lane: `task:${taskId}`, entityId: taskId,
          body: input as unknown as Record<string, unknown>,
        });
        if (created.outcome.kind === 'refused') {
          toast.error(
            t('common.error'),
            (created.outcome.code && t(`offline.errors.${created.outcome.code}`, { defaultValue: '' })) ||
              created.outcome.message ||
              t('createTask.failedToCreate'),
          );
          return { kind: 'failed' };
        }
        for (const photo of photos) {
          await addTaskPhoto(offline.engine, offline.files, {
            taskId, fileName: photo.fileName, mime: photo.mimeType, width: photo.width, height: photo.height, uri: photo.uri,
            dependsOn: created.state === 'done' ? [] : [created.opId],
          }).catch(() => undefined);
        }
        if (created.outcome.kind === 'queued') {
          // Not on the server yet, so there is no job page to open.
          toast.info(t('offline.savedForLater'));
          return { kind: 'queued' };
        }
        toast.success(t('newJob.doneTitle'), input.title);
        return { kind: 'created', id: taskId };
      }

      const task = await tasksApi.create(input);
      for (const photo of photos) {
        try {
          const presign = await taskAttachmentsApi.getPresignedUrl(task.id, photo.fileName, photo.mimeType);
          if (presign?.uploadUrl) {
            await uploadToPresignedUrl(presign.uploadUrl, photo.uri, photo.mimeType);
            await taskAttachmentsApi.confirmUpload(task.id, {
              fileName: photo.fileName,
              fileUrl: presign.fileUrl,
              fileType: photo.mimeType,
              fileSize: photo.fileSize,
            });
          }
        } catch {
          // The job exists; carry on with the other photos.
        }
      }
      toast.success(t('newJob.doneTitle'), input.title);
      return { kind: 'created', id: task.id };
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('createTask.failedToCreate'));
      return { kind: 'failed' };
    } finally {
      setSubmitting(false);
    }
  }, [offline.engine, offline.files, toast, t]);

  return { create, submitting };
}
