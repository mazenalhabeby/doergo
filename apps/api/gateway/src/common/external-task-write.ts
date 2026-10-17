import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { RpcRequest, findTask } from '@hbcfield/shared/microservices';
import { taskActor } from './task-actor';

/** Reads one task through task-service's gate (`find_task`). */
export type TaskReader = (data: RpcRequest<typeof findTask>) => Promise<unknown>;

export const EXTERNAL_TASK_WRITE_MESSAGE =
  "An external member can add to a job they raised, not to the organization's other work.";

/**
 * May this caller WRITE onto this task — a comment, a photo, a field value?
 *
 * ⚠️ An external member writes only on a task THEY CREATED. An observer raising
 * a job ("the boiler in block C leaks") must be able to add the photo and a
 * note to it — that is the point of letting them raise one. Anywhere else a
 * client's or partner's words and files would land on the organization's own
 * record of the work, which the checklist routes already refuse outright.
 * Reads are untouched.
 *
 * Internal members return immediately with no lookup, so the cost is paid only
 * by external callers. The task is read through the normal task gate, so a task
 * they cannot see is refused there exactly as before.
 *
 * `attachmentId`: the delete route names a task AND an attachment, and
 * task-service deletes by the attachment alone — so "my own job" is only true
 * if the attachment is ON that job. Otherwise an external member could name
 * their own task and somebody else's photo.
 */
export async function assertExternalMayWriteTask(
  req: { user?: any; method?: string },
  taskId: string,
  readTask: TaskReader,
  opts: { attachmentId?: string } = {},
): Promise<void> {
  const user = req?.user;
  if (user?.isExternal !== true) return;

  const res: any = await readTask({ id: taskId, ...taskActor(req) });
  const task = res && typeof res === 'object' && 'data' in res ? res.data : res;
  if (!task || task.createdById !== user.id) {
    throw new ForbiddenException(EXTERNAL_TASK_WRITE_MESSAGE);
  }
  if (opts.attachmentId !== undefined) {
    const onTask = (task.attachments ?? []).some((a: { id?: string }) => a?.id === opts.attachmentId);
    if (!onTask) throw new NotFoundException('Attachment not found');
  }
}
