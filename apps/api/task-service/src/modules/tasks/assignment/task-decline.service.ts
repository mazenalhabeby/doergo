import { Inject, Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@hbcfield/shared';
import { TaskSupportService } from '../core/task-support.service';
import { RolePoolService } from './role-pool.service';
import { TaskCrewChangeService } from './task-crew-change.service';
import { personName, TaskStatus, TaskEventType, success, assertFoundInOrg } from '@hbcfield/shared';
import { emitEvent, taskDeclinedEvent } from '@hbcfield/shared/microservices';
import { TASK_JOBS, type JobData } from '@hbcfield/shared';

/** A worker declining a job they were given. */
@Injectable()
export class TaskDeclineService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly support: TaskSupportService,
    /** A task open to a role goes back to the ROLE when its taker declines. */
    private readonly rolePool: RolePoolService,
    /** The one writer of what a crew change implies (lead, places, chat, checklist owners). */
    private readonly crewChange: TaskCrewChangeService,
  ) {}

  /**
   * Decline task assignment (TECHNICIAN only)
   * Returns task to NEW status and removes assignment
   */
  async decline(data: JobData<typeof TASK_JOBS.decline>) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }
    // Another organization's job, not given to the caller, does not exist to them: 404, never a
    // 403 TASK_REASSIGNED that confirms the id. (A guest it WAS given to still declines it.)
    if (task.assignedToId !== data.userId) assertFoundInOrg(task, data.organizationId, 'Task');

    /*
      A decline can arrive hours after the tap, from a phone that was offline.
      By then the office may have given the job to someone else, or it may
      have moved on — each is said with a code the phone can put in words,
      rather than a bare 403/400 that reads as "the app broke".
    */
    // A task taken from a ROLE goes back to the role — re-offered — never to nobody.
    if (task.openRoleId) {
      return this.rolePool.returnToRole({
        taskId: task.id,
        userId: data.userId,
        organizationId: data.organizationId,
        reason: data.reason ?? null,
      });
    }
    if (task.assignedToId !== data.userId) {
      throw new ForbiddenException({ message: 'You can only decline tasks assigned to you', code: 'TASK_REASSIGNED' });
    }
    if (task.status !== TaskStatus.ASSIGNED) {
      throw new ConflictException({
        message: `This task was moved to ${task.status} before your decline arrived`,
        code: 'TASK_STATE_CONFLICT',
        params: {
          current: { id: task.id, status: task.status, assignedToId: task.assignedToId, updatedAt: task.updatedAt },
        },
      });
    }

    const previousWorker = task.assignedTo;

    // Claimed, not overwritten: a reassignment landing between the read above
    // and this write must not be undone by a decline meant for the old one.
    const claimed = await this.prisma.task.updateMany({
      where: { id: data.id, assignedToId: data.userId, status: TaskStatus.ASSIGNED },
      data: { assignedToId: null, status: TaskStatus.NEW },
    });
    if (claimed.count === 0) {
      const now = await this.prisma.task.findUnique({
        where: { id: data.id },
        select: { id: true, status: true, assignedToId: true, updatedAt: true },
      });
      throw new ConflictException({
        message: `This task was changed at the same moment`,
        code: now?.assignedToId === data.userId ? 'TASK_STATE_CONFLICT' : 'TASK_REASSIGNED',
        params: { current: now },
      });
    }
    /*
      Off the crew too, not only off the column: a crew row left behind made the
      decliner the job's primary again on the next crew change (syncPrimaryAssignee),
      and kept them in its chat. Then the same writer as every other crew change.
    */
    await this.prisma.taskAssignee.deleteMany({ where: { taskId: data.id, userId: data.userId } });
    await this.crewChange.afterAssigneesChanged(data.id, [], data.userId);
    const updatedTask = await this.prisma.task.findUniqueOrThrow({
      where: { id: data.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    await this.support.createTaskEvent(data.id, data.userId, TaskEventType.UNASSIGNED, {
      reason: 'Technician declined the assignment',
      previousWorkerId: previousWorker?.id,
      previousWorkerName: previousWorker ? personName(previousWorker) : null,
    });

    // Notify dispatcher/client that task was declined
    emitEvent(this.notificationClient, taskDeclinedEvent, {
      task: updatedTask,
      declinedBy: previousWorker,
    });

    this.support.invalidateStatusCountsCache(updatedTask.organizationId);

    return success(updatedTask, 'Task declined and returned for reassignment');
  }
}
