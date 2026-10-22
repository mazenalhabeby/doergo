import { BadRequestException, ForbiddenException, type Logger } from '@nestjs/common';
import {
  TaskStatus,
  TaskEventType,
  Role,
  STATUS_TRANSITIONS,
  accessAllowsInSpace,
  mayChangeStatus,
  assertFoundInOrg,
} from '@hbcfield/shared';
import type { PrismaService } from '@hbcfield/shared';
import type { CachedWorkflow, WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowId } from '../../workflows/space-workflow.util';
import type { StatusTask, UpdateStatusInput } from './task-status.types';

/**
 * The first gates of `TaskStatusService.updateStatus`, in the order it asks them:
 * who may move this task at all, when the previous change happened, and
 * whether the workflow allows this move.
 */

/** Managers (ADMIN or "view all tasks") run the board; see assertMayMoveStatus. */
export function managesBoard(data: UpdateStatusInput): boolean {
  // Managers (ADMIN or "view all tasks") run the board and may move any card to
  // any column of its workflow; field workers only advance their own tasks along
  // the workflow's declared transitions.
  return data.userRole === Role.ADMIN || !!data.canViewAllTasks;
}

/**
 * Role-based authorization.
 * Any assigned user can set execution statuses on their assigned tasks;
 * ADMIN/DISPATCHER can also cancel tasks they have authority over.
 */
export function assertMayMoveStatus(
  task: StatusTask,
  data: UpdateStatusInput,
  who: { isAssignedUser: boolean; hasManageAuthority: boolean },
  logger: Logger,
): void {
  const { isAssignedUser } = who;
  const isCancelation = data.status === TaskStatus.CANCELED;

  if (isCancelation) {
    // Cancellation never crosses the organization — not for an ADMIN who once
    // created the task (a member who moved orgs) and not as a 403 that would
    // confirm the id. Another organization's task is answered like a missing one.
    assertFoundInOrg(task, data.organizationId, 'Task');
    // Cancellation authorization (new access-flag model).
    if (data.userRole === Role.ADMIN || data.canViewAllTasks) {
      // ADMIN, or the "view all tasks" grant → can cancel any task in their org.
    } else {
      // No org-wide authority: cannot cancel (assigned users execute, they
      // don't cancel — they contact someone who can).
      if (!isAssignedUser) {
        throw new ForbiddenException('You can only update status of tasks assigned to you');
      }
      throw new ForbiddenException('You cannot cancel tasks assigned to you. Contact an administrator.');
    }
    return;
  }
  // Any non-cancel status: canonical execution statuses AND custom-workflow
  // columns (including an "Assigned" column, which the old code wrongly sent to
  // "Access denied"). A worker may set these on tasks assigned to them; a
  // manager may move any card on the board.
  if (!isAssignedUser && !who.hasManageAuthority) {
    logger.warn(`Authorization denied: non-assigned user attempted status update`, {
      userId: data.userId,
      taskId: data.id,
      status: data.status,
    });
    // The code is what an offline phone shows: "the office gave this job to
    // someone else before your change arrived".
    throw new ForbiddenException({
      message: 'You can only update execution status of tasks assigned to you',
      code: 'TASK_REASSIGNED',
    });
  }
  // Cross-org isolation (C2): the authority checks above never compared the
  // task's org to the caller's, so an ADMIN / canViewAllTasks holder in one
  // tenant could drive a task in ANOTHER tenant. A foreign task may only be
  // moved with a CONTRIBUTE/CONTROL (canCreateTasks) grant for its real space
  // — mirroring update() and assign(). Own-org tasks skip this.
  if (task.organizationId !== data.organizationId) {
    if (!task.spaceId || !accessAllowsInSpace(data.access, 'canCreateTasks', task.spaceId)) {
      throw new ForbiddenException('You can only update the status of tasks in your organization');
    }
  }
}

/**
 * When the previous status change happened.
 *
 * ⚠️ "Before the change it follows" reads the previous change's OWN time, not
 * when its row was written: three changes made offline arrive in one push,
 * seconds apart, and the second must be compared with 09:00, not 11:14.
 */
export async function previousChangeAt(prisma: PrismaService, taskId: string): Promise<Date | null> {
  const lastChange = await prisma.taskEvent.findFirst({
    where: { taskId, eventType: TaskEventType.STATUS_CHANGED },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, metadata: true },
  });
  const previousOccurred = (lastChange?.metadata as { occurredAt?: string } | null)?.occurredAt;
  return previousOccurred ? new Date(previousOccurred) : (lastChange?.createdAt ?? null);
}

/**
 * Validate the status transition — honor the task's workflow (its own, else its
 * space's) when present; otherwise the canonical field-service machine.
 * Answers the task's effective workflow — also where the target step's FORM is read.
 */
export async function assertTransitionAllowed(
  prisma: PrismaService,
  workflowCache: WorkflowConfigCache,
  task: StatusTask,
  data: UpdateStatusInput,
  isManager: boolean,
): Promise<CachedWorkflow | null> {
  let effWorkflowId: string | null = task.workflowId ?? null;
  if (!effWorkflowId && task.spaceId) {
    effWorkflowId = await resolveSpaceDefaultWorkflowId(prisma, task.spaceId);
  }
  let allowedTransitions: string[] | null = null;
  let workflowStatusKeys: string[] | null = null;
  // Is the task already in a terminal status? Set from the workflow below when
  // there is one; otherwise from the canonical statuses.
  let currentIsFinished =
    task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CLOSED || task.status === TaskStatus.CANCELED;
  let wf = null;
  if (effWorkflowId) {
    // Read from the per-org workflow cache (Redis) instead of the DB.
    wf = await workflowCache.getWorkflow(data.organizationId, effWorkflowId);
    workflowStatusKeys = wf?.statuses?.map((s: { key: string }) => s.key) ?? null;
    const cur = wf?.statuses?.find((s: { key: string }) => s.key === task.status);
    if (cur) allowedTransitions = cur.transitions ?? [];
    // A workflow marks its own terminal columns; honour those rather than the
    // canonical names, which a custom workflow need not use. Only when the
    // workflow actually defines this status — otherwise the canonical answer
    // stands, rather than being overwritten with "not finished".
    if (cur) {
      const c = cur as { isFinal?: boolean; isCanceled?: boolean };
      currentIsFinished = !!c.isFinal || !!c.isCanceled;
    }
  }
  // Fallback to the canonical machine when there's no workflow, or the current
  // status isn't part of it (mixed/legacy data).
  if (allowedTransitions === null) {
    allowedTransitions = STATUS_TRANSITIONS[task.status as TaskStatus] || [];
  }
  // A manager dragging on the board may drop a card into ANY column of the task's
  // workflow (free-form kanban) — even where the workflow declares no transitions
  // (e.g. a Support flow) — as long as the target is a real status of that
  // workflow (or a valid canonical status). Execution users follow the declared
  // transitions.
  const targetIsValidStatus = workflowStatusKeys
    ? workflowStatusKeys.includes(data.status as string)
    : (Object.values(TaskStatus) as string[]).includes(data.status as string);
  /*
    One rule, shared with the screens that offer the move (mayChangeStatus in
    @hbcfield/shared). Written twice, it drifted: the board let a manager drag
    a finished task the service refused, and the task page hid a transition
    the service allowed.
  */
  const permitted = mayChangeStatus({
    from: task.status as string,
    to: data.status as string,
    allowedTargets: allowedTransitions,
    targetIsValidStatus,
    isManager,
    fromIsFinished: currentIsFinished,
  });
  if (!permitted) {
    throw new BadRequestException(
      `Invalid status transition from ${task.status} to ${data.status}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
    );
  }
  return wf;
}
