import { getStatusCapabilities } from '@hbcfield/shared/client';
import { ApiError } from '../../lib/api/client';
import { tasksApi } from '../../lib/api/tasks';
import { taskAttachmentsApi } from '../../lib/api/attachments';
import type { Comment, Task } from '../../lib/api/types';
import type { RecordsStore } from '../db/records-store';
import type { OutboxOp } from '../outbox/types';
import { mergeAttachments, mergeComments, overlayTask, pendingAttachments, pendingComments } from './overlay';

/** Where a task detail came from — the screen says "saved on this phone" for the second. */
export type Source = 'server' | 'phone';

export interface TaskDetail {
  task: Task & { pendingSync?: boolean; workflow?: any; capabilities?: string[] };
  comments: (Comment & { pendingSync?: boolean })[];
  attachments: any[];
  source: Source;
}

/** A failure that means "no network", as opposed to the server saying no. */
export function isUnreachable(err: unknown): boolean {
  return err instanceof ApiError ? err.statusCode === 0 || err.statusCode === 408 : err instanceof TypeError;
}

/**
 * The task screen's data: from the server when it answers, from the phone
 * when it does not — with the member's unsent changes laid on top either way.
 *
 * A successful server load is also saved, so the next time this task is
 * opened in a basement it opens with everything it had, not just the list row.
 */
export async function loadTaskDetail(
  id: string,
  deps: {
    records: RecordsStore | null;
    operations: readonly OutboxOp[];
    me: { id: string; firstName?: string; lastName?: string };
    /** Where a held photo lives on this phone; without it pending photos are not shown. */
    fileUri?: (id: string, mime: string) => string;
  },
): Promise<TaskDetail> {
  const { records, operations, me, fileUri } = deps;
  const heldPhotos = fileUri ? pendingAttachments(id, operations, fileUri) : [];
  try {
    const [task, comments, attachments] = await Promise.all([
      tasksApi.getById(id),
      tasksApi.getComments(id),
      taskAttachmentsApi.getAttachments(id).catch(() => []),
    ]);
    if (records) {
      void records.upsert('taskDetail', { ...(task as any), updatedAt: task.updatedAt }).catch(() => undefined);
      void records.replaceChildren('comments', id, comments as any).catch(() => undefined);
    }
    return {
      task: overlayTask(task, operations),
      comments: mergeComments(comments, pendingComments(id, operations, me)) as TaskDetail['comments'],
      attachments: mergeAttachments(attachments || [], heldPhotos),
      source: 'server',
    };
  } catch (err) {
    if (!records || !isUnreachable(err)) throw err;
    const local = await localTaskDetail(id, records);
    if (!local) throw err;
    const comments = (await records.listByParent<Comment>('comments', id)).map((r) => r.data);
    const attachments = (await records.listByParent<any>('attachments', id)).map((r) => r.data);
    return {
      task: overlayTask(local, operations),
      comments: mergeComments(comments, pendingComments(id, operations, me)) as TaskDetail['comments'],
      attachments: mergeAttachments(attachments, heldPhotos),
      source: 'phone',
    };
  }
}

/**
 * The fullest copy the phone has: the last detail the server sent, else the
 * list row plus its flow — enough to show the task and offer its next step.
 */
async function localTaskDetail(id: string, records: RecordsStore): Promise<TaskDetail['task'] | null> {
  const [detail, row] = await Promise.all([records.get<any>('taskDetail', id), records.get<any>('tasks', id)]);
  // The list row is refreshed by every pull; the saved detail only when opened.
  // Prefer whichever the server wrote last, keeping the detail's extra fields.
  const base =
    detail && row
      ? (row.data.updatedAt ?? '') > (detail.data.updatedAt ?? '')
        ? { ...detail.data, ...row.data }
        : detail.data
      : detail?.data ?? row?.data;
  if (!base) return null;

  if (!base.workflow) {
    const flowId = base.workflowId ?? base.space?.workflowId ?? null;
    const flow = flowId ? (await records.get<any>('workflows', flowId))?.data : null;
    if (flow) base.workflow = flow;
  }
  const current = base.workflow?.statuses?.find((s: any) => s.key === base.status);
  base.capabilities = current ? current.capabilities ?? [] : getStatusCapabilities(base.workflow?.name, base.status);
  return base;
}
