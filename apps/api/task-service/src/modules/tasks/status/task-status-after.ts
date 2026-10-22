import type { Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { personName, TaskStatus, personNameOf } from '@hbcfield/shared';
import type { PrismaService } from '@hbcfield/shared';
import type { PresenceService } from '../../attendance/presence/presence.service';
import type { CrewService } from '../handover/crew.service';
import type { TaskSupportService } from '../core/task-support.service';
import type { PreparedStepSubmission } from './step-submission';
import { applyStepFormCrm } from './task-status-crm';
import type { OfficeStart, StatusTask, TaskWithPeople, UpdateStatusInput } from './task-status.types';
import {
  emitEvent,
  blockedTasksReminderEvent,
  taskStartedForYouEvent,
  taskStatusChangedEvent,
} from '@hbcfield/shared/microservices';

/** `TaskStatusService`'s own collaborators, as the after-effects of a move use them. */
export interface AfterMoveDeps {
  prisma: PrismaService;
  notificationClient: ClientProxy;
  presence: PresenceService;
  crew: CrewService;
  support: TaskSupportService;
  logger: Logger;
  authClient?: ClientProxy;
}

/** What follows a move that was written: the crew, the people told, presence, reminders. */
export async function afterStatusMove(
  deps: AfterMoveDeps,
  m: {
    task: StatusTask;
    updatedTask: TaskWithPeople;
    data: UpdateStatusInput;
    isAssignedUser: boolean;
    startsWork: boolean;
    wasCounting: boolean;
    officeStart: OfficeStart | null;
    occurredAt: Date;
    submission: PreparedStepSubmission | null;
    submissionId: string | null;
  },
): Promise<void> {
  const { task, updatedTask, data, isAssignedUser, officeStart, occurredAt } = m;
  // Into work: the worker leaves any other job they were on (one job at a time),
  // and a job that has just started asks its crew on the clock to join.
  if (m.startsWork) {
    const worker = officeStart?.forUserId ?? (isAssignedUser ? data.userId : null);
    if (worker) await deps.crew.leaveOtherJobs(worker, task.organizationId, task.id, occurredAt);
    if (!m.wasCounting) void deps.crew.announceStart(task.id, worker ?? data.userId, occurredAt);
  }

  if (officeStart) {
    const by = await personNameOf(deps.prisma, data.userId);
    emitEvent(deps.notificationClient, taskStartedForYouEvent, {
      taskId: task.id,
      taskTitle: updatedTask.title,
      userId: officeStart.forUserId,
      byName: by ? personName(by) : '',
      reason: officeStart.reason,
      organizationId: task.organizationId,
    });
  }

  // The answers' CRM side — never allowed to undo the move.
  if (m.submission && m.submissionId && task.customerId) {
    await applyStepFormCrm(deps, {
      submissionId: m.submissionId,
      submission: m.submission,
      task: {
        title: updatedTask.title,
        customerId: task.customerId,
        spaceId: task.spaceId,
        organizationId: task.organizationId,
        timezone: task.space?.timezone ?? null,
      },
      userId: data.userId,
      userRole: data.userRole,
    });
  }

  // Notify about status change
  emitEvent(deps.notificationClient, taskStatusChangedEvent, {
    task: updatedTask,
    oldStatus: task.status,
    newStatus: data.status,
    // Who moved it — a creator completing their own task is not emailed about it.
    actorId: data.userId,
    watcherIds: await deps.support.taskWatcherIds(updatedTask.assignedToId, updatedTask.organizationId),
  });

  // Only the member moving the job themselves: an office drag is not evidence of where anybody is.
  if (isAssignedUser && (data.status === TaskStatus.EN_ROUTE || data.status === TaskStatus.ARRIVED)) {
    void deps.presence.onJobMoved({
      userId: data.userId,
      organizationId: updatedTask.organizationId,
      reason: data.status === TaskStatus.EN_ROUTE ? 'ON_THE_WAY' : 'AT_JOB',
      at: occurredAt,
    });
  }

  // (c) Blocked Task Reminder — after accepting a new task, remind about blocked ones
  if (isAssignedUser && data.status === TaskStatus.ACCEPTED) {
    try {
      const blockedTasks = await deps.prisma.task.findMany({
        where: { assignedToId: data.userId, status: TaskStatus.BLOCKED },
        select: { id: true, title: true },
      });
      if (blockedTasks.length > 0) {
        emitEvent(deps.notificationClient, blockedTasksReminderEvent, {
          userId: data.userId,
          blockedTasks: blockedTasks.map((t) => ({ id: t.id, title: t.title })),
          newTaskId: data.id,
          newTaskTitle: updatedTask.title,
        });
      }
    } catch (err) {
      deps.logger.warn('Failed to send blocked tasks reminder', err);
    }
  }

  deps.support.invalidateStatusCountsCache(updatedTask.organizationId);
}
