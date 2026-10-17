import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { personName, TaskStatus, TaskEventType, success } from '@hbcfield/shared';
import { TaskAssignmentBase } from './task-assignment.base';

/** A worker declining a job they were given. */
@Injectable()
export class TaskDeclineService extends TaskAssignmentBase {
  /**
   * Decline task assignment (TECHNICIAN only)
   * Returns task to NEW status and removes assignment
   */
  async decline(data: { id: string; userId: string; userRole: string; canViewAllTasks?: boolean; organizationId: string }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    /*
      A decline can arrive hours after the tap, from a phone that was offline.
      By then the office may have given the job to someone else, or it may
      have moved on — each is said with a code the phone can put in words,
      rather than a bare 403/400 that reads as "the app broke".
    */
    // A task taken from a ROLE goes back to the role — re-offered — never to nobody.
    if (task.openRoleId) {
      return this.rolePool.returnToRole({ taskId: task.id, userId: data.userId, organizationId: data.organizationId, reason: (data as any).reason ?? null });
    }
    if (task.assignedToId !== data.userId) {
      throw new ForbiddenException({ message: 'You can only decline tasks assigned to you', code: 'TASK_REASSIGNED' });
    }
    if (task.status !== TaskStatus.ASSIGNED) {
      throw new ConflictException({
        message: `This task was moved to ${task.status} before your decline arrived`,
        code: 'TASK_STATE_CONFLICT',
        params: { current: { id: task.id, status: task.status, assignedToId: task.assignedToId, updatedAt: task.updatedAt } },
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
      const now = await this.prisma.task.findUnique({ where: { id: data.id }, select: { id: true, status: true, assignedToId: true, updatedAt: true } });
      throw new ConflictException({
        message: `This task was changed at the same moment`,
        code: now?.assignedToId === data.userId ? 'TASK_STATE_CONFLICT' : 'TASK_REASSIGNED',
        params: { current: now },
      });
    }
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
    this.notificationClient.emit('task_declined', {
      task: updatedTask,
      declinedBy: previousWorker,
    });

    this.support.invalidateStatusCountsCache(updatedTask.organizationId);

    return success(updatedTask, 'Task declined and returned for reassignment');
  }
}
