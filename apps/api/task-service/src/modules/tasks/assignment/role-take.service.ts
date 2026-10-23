import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  PrismaService,
  personName,
  minutesWaited,
  success,
  personNameOf,
  holdsOpenRole as holdsOpenRoleRule,
} from '@hbcfield/shared';
import { TaskEventType } from '@prisma/client';
import { Facts } from './role-pool-helpers';
import { TaskAssignmentService } from './task-assignment.service';
import { emitEvent, roleTaskTakenEvent } from '@hbcfield/shared/microservices';

/** Taking a place on a task open to a role — one conditional update, the first to take it gets it. */
@Injectable()
export class RoleTakeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
    /** What an assignment change sets off — the office's own path. */
    private readonly assignment: TaskAssignmentService,
  ) {}

  /** Does this person hold the task's open role in its workspace, right now? (role-holder.ts — one rule) */
  holdsOpenRole(task: Parameters<typeof holdsOpenRoleRule>[1], userId: string): Promise<boolean> {
    return holdsOpenRoleRule(this.prisma as never, task, userId);
  }

  async take(data: Facts & { taskId: string }) {
    const task = await this.prisma.task.findFirst({
      where: { id: data.taskId, organizationId: data.organizationId },
      select: {
        id: true,
        title: true,
        status: true,
        spaceId: true,
        workflowId: true,
        createdById: true,
        organizationId: true,
        openRoleId: true,
        openSpotsLeft: true,
        openedAt: true,
        openRole: { select: { name: true } },
      },
    });
    // A task the caller may not take is a task they cannot see: 404, never "it exists".
    if (!task || !(await this.holdsOpenRole(task, data.userId))) {
      // "Somebody was faster" only to somebody who could have taken it — to anyone else it does not exist.
      if (
        task?.openRoleId &&
        (task.openSpotsLeft ?? 0) <= 0 &&
        (await this.holdsOpenRole({ ...task, openSpotsLeft: 1 }, data.userId))
      ) {
        throw new ConflictException({
          message: 'Somebody else took the last place',
          code: 'ROLE_TASK_TAKEN',
          params: { takers: await this.takers(task.id) },
        });
      }
      throw new NotFoundException('Task not found');
    }
    const mine = await this.prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: task.id, userId: data.userId } },
      select: { id: true },
    });
    if (mine) throw new ConflictException({ message: 'You are already on this task', code: 'ROLE_TASK_ALREADY_YOURS' });

    // The same refusals as the office's picker: access profile and required credentials.
    await this.assignment.assertCanReceiveTasks([data.userId], task.workflowId, task.organizationId);

    const roleId = task.openRoleId!;
    let spotsLeft: number;
    try {
      spotsLeft = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.task.updateMany({
          where: { id: task.id, openRoleId: roleId, openSpotsLeft: { gt: 0 } },
          data: { openSpotsLeft: { decrement: 1 } },
        });
        if (claimed.count === 0)
          throw new ConflictException({ message: 'Somebody else took the last place', code: 'ROLE_TASK_TAKEN' });
        // The first to take it leads; a second place is a crew member.
        const lead = await tx.taskAssignee.findFirst({
          where: { taskId: task.id, role: 'LEAD' },
          select: { id: true },
        });
        await tx.taskAssignee.create({
          data: { taskId: task.id, userId: data.userId, role: lead ? 'MEMBER' : 'LEAD' },
        });
        const after = await tx.task.findUniqueOrThrow({ where: { id: task.id }, select: { openSpotsLeft: true } });
        return after.openSpotsLeft ?? 0;
      });
    } catch (e) {
      if (e instanceof ConflictException) {
        throw new ConflictException({ ...(e.getResponse() as object), params: { takers: await this.takers(task.id) } });
      }
      // The crew row is unique per person: a double tap from one phone lands here, once.
      if (e?.code === 'P2002')
        throw new ConflictException({ message: 'You are already on this task', code: 'ROLE_TASK_ALREADY_YOURS' });
      throw e;
    }

    const takenAt = new Date();
    const waited = minutesWaited(task.openedAt, takenAt);
    const taker = await personNameOf(this.prisma, data.userId);
    const takerName = personName(taker);
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: data.userId,
        eventType: TaskEventType.TAKEN,
        metadata: {
          roleId,
          roleName: task.openRole?.name ?? null,
          waitedMinutes: waited,
          spotsLeft,
          workerName: takerName,
        },
      },
    });
    // From here it is an ordinary assignment — the office's own path.
    await this.assignment.onAssigneesChanged(task.id, [data.userId], data.userId);

    if (task.createdById !== data.userId) {
      emitEvent(this.notifications, roleTaskTakenEvent, {
        task: { id: task.id, title: task.title, organizationId: task.organizationId },
        takerName,
        notifyIds: [task.createdById],
      });
    }
    return success({ id: task.id, spotsLeft, waitedMinutes: waited }, 'Task taken');
  }

  /** Who holds the places — for "Ahmad took it" on a refusal. */
  private async takers(taskId: string): Promise<string[]> {
    const rows = await this.prisma.taskAssignee.findMany({
      where: { taskId },
      select: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    return rows.map((r) => personName(r.user));
  }
}
