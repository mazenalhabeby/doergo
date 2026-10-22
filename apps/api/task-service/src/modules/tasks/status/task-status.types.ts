import { Prisma } from '@prisma/client';
import type { TaskStatusJob } from '@hbcfield/shared';

/** What `TaskStatusService.updateStatus` is asked — the `task.updateStatus` job (shared queues/task-jobs-types.ts). */
export type UpdateStatusInput = TaskStatusJob;

/** The task as updateStatus reads it: with its site's zone. */
export type StatusTask = Prisma.TaskGetPayload<{ include: { space: { select: { timezone: true } } } }>;

/** The task as every status answer returns it. */
export const TASK_WITH_PEOPLE_INCLUDE = {
  assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
} as const;

/** The task as read back after the write. */
export type TaskWithPeople = Prisma.TaskGetPayload<{
  include: {
    assignedTo: { select: { id: true; firstName: true; lastName: true; avatarUrl: true } };
    createdBy: { select: { id: true; firstName: true; lastName: true; avatarUrl: true } };
  };
}>;

/** The office starting a job for somebody: for whom, why, and (when given) when. */
export interface OfficeStart {
  forUserId: string;
  reason: string;
  at: Date | null;
}
