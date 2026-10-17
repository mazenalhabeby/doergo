import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { personName, minutesWaited, success } from '@hbcfield/shared';
import { TaskEventType } from '@prisma/client';
import { Facts } from './role-pool-helpers';
import { RolePoolBase } from './role-pool.base';

/** Taking a place on a task open to a role — one conditional update, the first to take it gets it. */
@Injectable()
export class RoleTakeService extends RolePoolBase {
  async take(data: Facts & { taskId: string }) {
    const task = await this.prisma.task.findFirst({
      where: { id: data.taskId, organizationId: data.organizationId },
      select: {
        id: true, title: true, status: true, spaceId: true, workflowId: true, createdById: true, organizationId: true,
        openRoleId: true, openSpotsLeft: true, openedAt: true,
        openRole: { select: { name: true } },
      },
    });
    // A task the caller may not take is a task they cannot see: 404, never "it exists".
    if (!task || !(await this.holdsOpenRole(task, data.userId))) {
      // "Somebody was faster" only to somebody who could have taken it — to anyone else it does not exist.
      if (task?.openRoleId && (task.openSpotsLeft ?? 0) <= 0 && (await this.holdsOpenRole({ ...task, openSpotsLeft: 1 }, data.userId))) {
        throw new ConflictException({ message: 'Somebody else took the last place', code: 'ROLE_TASK_TAKEN', params: { takers: await this.takers(task.id) } });
      }
      throw new NotFoundException('Task not found');
    }
    const mine = await this.prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId: task.id, userId: data.userId } }, select: { id: true } });
    if (mine) throw new ConflictException({ message: 'You are already on this task', code: 'ROLE_TASK_ALREADY_YOURS' });

    // The same refusals as the office's picker: access profile and required credentials.
    await this.tasks.assertCanReceiveTasks([data.userId], task.workflowId, task.organizationId);

    const roleId = task.openRoleId!;
    let spotsLeft: number;
    try {
      spotsLeft = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.task.updateMany({
          where: { id: task.id, openRoleId: roleId, openSpotsLeft: { gt: 0 } },
          data: { openSpotsLeft: { decrement: 1 } },
        });
        if (claimed.count === 0) throw new ConflictException({ message: 'Somebody else took the last place', code: 'ROLE_TASK_TAKEN' });
        // The first to take it leads; a second place is a crew member.
        const lead = await tx.taskAssignee.findFirst({ where: { taskId: task.id, role: 'LEAD' }, select: { id: true } });
        await tx.taskAssignee.create({ data: { taskId: task.id, userId: data.userId, role: lead ? 'MEMBER' : 'LEAD' } });
        const after = await tx.task.findUniqueOrThrow({ where: { id: task.id }, select: { openSpotsLeft: true } });
        return after.openSpotsLeft ?? 0;
      });
    } catch (e: any) {
      if (e instanceof ConflictException) {
        throw new ConflictException({ ...(e.getResponse() as object), params: { takers: await this.takers(task.id) } });
      }
      // The crew row is unique per person: a double tap from one phone lands here, once.
      if (e?.code === 'P2002') throw new ConflictException({ message: 'You are already on this task', code: 'ROLE_TASK_ALREADY_YOURS' });
      throw e;
    }

    const takenAt = new Date();
    const waited = minutesWaited(task.openedAt, takenAt);
    const taker = await this.prisma.user.findUnique({ where: { id: data.userId }, select: { firstName: true, lastName: true } });
    const takerName = personName(taker);
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id, userId: data.userId, eventType: TaskEventType.TAKEN,
        metadata: { roleId, roleName: task.openRole?.name ?? null, waitedMinutes: waited, spotsLeft, workerName: takerName },
      },
    });
    // From here it is an ordinary assignment — the office's own path.
    await this.tasks.onAssigneesChanged(task.id, [data.userId], data.userId);

    if (task.createdById !== data.userId) {
      this.notifications.emit('role_task_taken', {
        task: { id: task.id, title: task.title, organizationId: task.organizationId },
        takerName,
        notifyIds: [task.createdById],
      });
    }
    return success({ id: task.id, spotsLeft, waitedMinutes: waited }, 'Task taken');
  }
}
