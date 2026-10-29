import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  PrismaService,
  personName,
  TaskEventType,
  success,
  canReceiveTasks,
  memberOpenJobs,
  assertFoundInOrg,
  workerToAssign,
} from '@hbcfield/shared';
import { assertMayAssign, assertTargetIsInSpace } from '../core/task-scope';
import { ClientProxy } from '@nestjs/microservices';
import { TaskSupportService } from '../core/task-support.service';
import { assertAssigneesAreQualified } from './assignee-credentials';
import { TaskCrewChangeService } from './task-crew-change.service';
import { emitEvent, taskUpdatedEvent } from '@hbcfield/shared/microservices';
import type { TaskAssigneeRole } from '@prisma/client';
import { TASK_JOBS, type JobData } from '@hbcfield/shared';

/** Adding and removing people on a job's crew, and releasing a member who left from their open work. */
@Injectable()
export class TaskCrewMembersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly support: TaskSupportService,
    private readonly crewChange: TaskCrewChangeService,
  ) {}

  async addAssignee(data: JobData<typeof TASK_JOBS.addAssignee>) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    assertFoundInOrg(task, data.organizationId, 'Task');
    assertMayAssign(task, data);
    await assertTargetIsInSpace(this.prisma, task, data.userId, data);

    // Verify the target user exists in the organization
    const user = await workerToAssign(this.prisma, data.userId, data.organizationId);
    if (!user) throw new NotFoundException('User not found or not in your organization');
    if (!canReceiveTasks(user)) {
      throw new BadRequestException(
        `${user.firstName} ${user.lastName} cannot be assigned tasks — their access profile does not include the Tasks feature.`,
      );
    }

    // A second person added to a task is doing the same work as the first, so
    // the same certificate applies.
    const assigneeTask = await this.prisma.task.findFirst({
      where: { id: data.taskId, organizationId: data.organizationId },
      select: { workflowId: true, organizationId: true },
    });
    await assertAssigneesAreQualified(
      this.prisma,
      [user.id],
      [user],
      assigneeTask?.workflowId,
      assigneeTask?.organizationId,
    );

    const role = (data.role as TaskAssigneeRole) || 'MEMBER';

    // If adding as LEAD, demote existing LEAD to MEMBER
    if (role === 'LEAD') {
      await this.prisma.taskAssignee.updateMany({
        where: { taskId: data.taskId, role: 'LEAD' },
        data: { role: 'MEMBER' },
      });
    }

    // Read before the write: after the upsert there is no telling whether this
    // person is new to the task or was already on it in another role.
    const wasAlreadyOn = !!(await this.prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
      select: { id: true },
    }));

    const assignee = await this.prisma.taskAssignee.upsert({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
      create: { taskId: data.taskId, userId: data.userId, role },
      update: { role },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });

    // Primary, status and the notification — all of it, in one place.
    // `wasAlreadyOn` decides whether this is news: re-adding somebody to change
    // their role must not push them a second time about work they already have.
    await this.crewChange.afterAssigneesChanged(data.taskId, wasAlreadyOn ? [] : [data.userId], data.requestUserId);

    await this.support.createTaskEvent(data.taskId, data.requestUserId, TaskEventType.ASSIGNEE_ADDED, {
      assigneeId: data.userId,
      assigneeName: personName(user),
      role,
    });

    emitEvent(this.notificationClient, taskUpdatedEvent, { task: { ...task, id: data.taskId } });

    return success(assignee);
  }

  /**
   * Remove an assignee from a task
   */
  async removeAssignee(data: JobData<typeof TASK_JOBS.removeAssignee>) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    assertFoundInOrg(task, data.organizationId, 'Task');
    // Taking somebody OFF a job is the same authority as putting them on it.
    assertMayAssign(task, data);

    const existing = await this.prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
    if (!existing) throw new NotFoundException('Assignee not found on this task');

    await this.prisma.taskAssignee.delete({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
    });

    // Sync the primary assignedToId field
    // Same writer as every other change to who is on this task. Nobody is newly
    // assigned by a removal, so nobody is told they have new work.
    await this.crewChange.afterAssigneesChanged(data.taskId, [], data.requestUserId);

    await this.support.createTaskEvent(data.taskId, data.requestUserId, TaskEventType.ASSIGNEE_REMOVED, {
      assigneeId: data.userId,
      assigneeName: existing.user ? personName(existing.user) : '',
    });

    emitEvent(this.notificationClient, taskUpdatedEvent, { task: { ...task, id: data.taskId } });

    return success(null, 'Assignee removed');
  }

  /**
   * Everything that follows from a change to who is on a task.
   *
   * ONE writer, because four had four opinions. `create`, `assign`,
   * `addAssignee` and `removeAssignee` each decided for themselves what an
   * assignment implies, and three of them were wrong in a different way: the
   * primary was cleared, the status never moved, and the person was never told.
   * Each of those was found separately, as a separate bug, from one report.
   *
   * The row mutation stays with the caller — they mean different things by it
   * ("make this one the lead" is not "add a colleague"). What is IDENTICAL
   * afterwards, and therefore lives here:
   *
   *   1. who is primarily responsible
   *   2. that a task with somebody on it is no longer merely NEW
   *   3. that a person given work is TOLD
   *
   * `newlyAssigned` is the caller's answer to "who did not have this before" —
   * only they know, since only they know what the rows looked like going in.
   */
  /**
   * Take somebody who is leaving off every job that is still OPEN.
   *
   * Through the same writer as the office's picker (`afterAssigneesChanged`),
   * so the lead, the role places, the today's-lead hand-over and the open
   * checklist items all follow — the one path that knows every consequence of
   * a crew changing. Finished, closed and canceled jobs keep the person: that
   * is the record of who did the work, and a leaver does not unmake history.
   *
   * Called by `member_offboard` and `member_deactivated` (members/member-offboard.service.ts).
   */
  async releaseMemberFromOpenWork(
    organizationId: string,
    userId: string,
    actorId: string,
    reason: 'MEMBER_LEFT' | 'MEMBER_DEACTIVATED' = 'MEMBER_LEFT',
  ): Promise<number> {
    /*
      ⚠️ "Finished" is the WORKFLOW's word, not ours (shared memberOpenJobs): the
      built-in flows end on Delivered, Done, Outcome, Submitted. A job in one of
      those is history, and the person stays on it.
    */
    const tasks = await memberOpenJobs(this.prisma, userId, organizationId);
    for (const { id } of tasks) {
      await this.prisma.taskAssignee.deleteMany({ where: { taskId: id, userId } });
      // The primary column too: a job assigned the old way has no crew row to remove.
      await this.prisma.task.updateMany({ where: { id, assignedToId: userId }, data: { assignedToId: null } });
      await this.crewChange.afterAssigneesChanged(id, [], actorId);
      await this.support.createTaskEvent(id, actorId, TaskEventType.ASSIGNEE_REMOVED, {
        assigneeId: userId,
        reason,
      });
    }
    return tasks.length;
  }
}
