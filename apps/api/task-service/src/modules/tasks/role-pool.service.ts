import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  canReceiveTasks,
  isOpenToRole,
  isWorkOver,
  kmBetween,
  parseRoleSpots,
  success,
  TaskStatus,
  type CandidateState,
} from '@hbcfield/shared';
import { TaskEventType } from '@prisma/client';
import { OVER, OpenRole, Facts } from './role-pool-helpers';
import { RolePoolBase } from './role-pool.base';
import { emitEvent, taskUpdatedEvent } from '@hbcfield/shared/microservices';

export { ROLE_WAVE_CLOSED } from './role-pool-helpers';

/**
 * A task OPEN TO A WORK ROLE — the server half of packages/shared/src/tasks/role-pool.ts.
 *
 * ⚠️ BESIDE THE NAME FLOW, NEVER INSTEAD OF IT. Nothing here runs for a task
 * with no `openRoleId`; the task list, its counts and the phone's offline copy
 * are untouched. An open task is reached through `openForMe` and, for a
 * holder of the role, `holdsOpenRole` in the task's own access check.
 *
 * ⚠️ TAKING IS ONE CONDITIONAL UPDATE. `openSpotsLeft` is decremented only
 * while it is above zero, in the same transaction that writes the crew row —
 * so two people tapping the last place at once cannot both get it, and a
 * person cannot take two places (the crew row is unique per task and person).
 *
 * ⚠️ ONCE TAKEN IT IS AN ORDINARY ASSIGNMENT. The crew row goes through the
 * same `afterAssigneesChanged` as the office's picker: primary person, status,
 * the assignment push, the checklist and the lead rules are not written twice.
 */
@Injectable()
export class RolePoolService extends RolePoolBase {
  /** After a task is opened (created, or re-opened by the office): the record, then the first wave. */
  async afterOpened(taskId: string, actorId: string, role: OpenRole, spots: number): Promise<void> {
    // The task already exists: nothing here may turn its creation into an error.
    try {
      await this.prisma.taskEvent.create({
        data: {
          taskId,
          userId: actorId,
          eventType: TaskEventType.OPENED_TO_ROLE,
          metadata: { roleId: role.id, roleName: role.name, spots },
        },
      });
      const t = await this.prisma.task.findUnique({ where: { id: taskId }, select: { priority: true } });
      if (t?.priority === 'URGENT') {
        // Urgent goes to everyone working today at once — claimed, so the sweep cannot send it a second time.
        const claimed = await this.prisma.task.updateMany({ where: { id: taskId, openWave: 0 }, data: { openWave: 1 } });
        if (claimed.count === 1) await this.offer(taskId, 1);
      } else {
        // The first wave goes now — a push a minute late is a minute a free person waited for nothing.
        await this.offer(taskId, 0);
      }
    } catch (e) {
      this.logger.error(`Opening ${taskId} to a role: record/offer failed: ${e}`);
    }
  }

  /**
   * The office opens an existing task to a role, changes how many it needs,
   * or closes it again (`roleId: null`). Asks the same right as assigning.
   */
  async setOpenRole(
    data: Facts & {
      taskId: string;
      roleId: string | null;
      spots?: number;
      userRole: string;
      canAssignTasks?: boolean;
      canViewAllTasks?: boolean;
      assignSpaceIds?: string[];
    },
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: data.taskId, organizationId: data.organizationId },
      select: { id: true, spaceId: true, status: true, openRoleId: true, openSpots: true, openSpotsLeft: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.tasks.assertMayAssignTask(task.id, data);
    if (isWorkOver(task.status)) {
      throw new ConflictException({ message: 'This task is finished', code: 'ROLE_TASK_FINISHED' });
    }

    if (!data.roleId) {
      // Closed to the role: nobody new can take it. Who already took it stays on it.
      await this.prisma.task.update({
        where: { id: task.id },
        data: { openRoleId: null, openSpots: null, openSpotsLeft: null, openedAt: null, openWave: 0 },
      });
      emitEvent(this.notifications, taskUpdatedEvent, { task: { id: task.id, organizationId: data.organizationId } });
      return success({ id: task.id, openRoleId: null });
    }

    const role = await this.resolveOpenRole(data.organizationId, task.spaceId, data.roleId);
    const spots = parseRoleSpots(data.spots);
    /*
      The places left are ALWAYS asked for − people on it (syncSpots, in SQL):
      a resize never writes an absolute "left" that a take landing in between
      would make wrong, and reopening never hands out places people hold.
      Never fewer places than people already on it.
    */
    const onIt = await this.prisma.taskAssignee.count({ where: { taskId: task.id } });
    const asked = Math.max(spots, onIt);
    if (task.openRoleId === role.id && task.openSpots != null) {
      // Same role, a different number: keep who already took it, and the wait.
      await this.prisma.task.update({ where: { id: task.id }, data: { openSpots: asked } });
      await this.syncSpots(task.id);
    } else {
      await this.prisma.task.update({ where: { id: task.id }, data: { ...this.openColumns(role.id, asked) } });
      await this.syncSpots(task.id);
      await this.afterOpened(task.id, data.userId, role, asked);
    }
    const after = await this.prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { openSpots: true, openSpotsLeft: true } });
    emitEvent(this.notifications, taskUpdatedEvent, { task: { id: task.id, organizationId: data.organizationId } });
    return success({ id: task.id, openRoleId: role.id, openSpots: after.openSpots, openSpotsLeft: after.openSpotsLeft });
  }

  /**
   * The work roles a task in this workspace can be opened to — switched on
   * here, or held by somebody here — each with how many hold it. Two queries.
   */
  async roleOptions(data: { organizationId: string; spaceId: string }) {
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: data.spaceId, organizationId: data.organizationId },
      select: { workRoleIds: true },
    });
    if (!space) throw new NotFoundException('Workspace not found');
    const holders = await this.prisma.spaceAssignment.groupBy({
      by: ['workRoleId'],
      where: { spaceId: data.spaceId, workRoleId: { not: null }, ...this.activeNow(), user: { isActive: true } },
      _count: { _all: true },
    });
    const count = new Map(holders.map((h) => [h.workRoleId!, h._count._all]));
    const roles = await this.prisma.accessRole.findMany({
      where: { organizationId: data.organizationId, kind: 'WORK', id: { in: [...new Set([...space.workRoleIds, ...count.keys()])] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return success(roles.map((r) => ({ id: r.id, name: r.name, holders: count.get(r.id) ?? 0 })));
  }

  /**
   * What the office sees before saving: how many hold the role here, how many
   * are free now, and the best ten. Read-only; asks the right to assign.
   */
  async preview(data: Facts & { spaceId: string; roleId: string; lat?: number | null; lng?: number | null }) {
    const role = await this.resolveOpenRole(data.organizationId, data.spaceId, data.roleId);
    const ranked = await this.candidates(data.organizationId, data.spaceId, role.id, { lat: data.lat ?? null, lng: data.lng ?? null });
    const count = (s: CandidateState) => ranked.filter((c) => c.state === s).length;
    return success({
      role,
      total: ranked.length,
      free: count('FREE'),
      busy: count('BUSY'),
      notWorking: count('NOT_WORKING'),
      onLeave: count('ON_LEAVE'),
      candidates: ranked.slice(0, 10).map((c) => ({
        userId: c.userId, name: c.name, state: c.state, distanceKm: c.distanceKm, jobsToday: c.jobsToday, takenThisWeek: c.takenThisWeek,
      })),
    });
  }

  /**
   * Hand a role task back. It goes back to its ROLE, not to nobody, and is
   * offered again. Only before the work has started — after that, leaving is
   * the crew's own "Leave", which keeps the time.
   */
  async returnToRole(data: Facts & { taskId: string; reason?: string | null }) {
    const task = await this.prisma.task.findFirst({
      where: { id: data.taskId, organizationId: data.organizationId },
      select: { id: true, status: true, openRoleId: true, openSpots: true, organizationId: true, openRole: { select: { name: true } } },
    });
    const mine = task
      ? await this.prisma.taskAssignee.findUnique({
          where: { taskId_userId: { taskId: task.id, userId: data.userId } },
          select: { id: true },
        })
      : null;
    if (!task || !mine) throw new NotFoundException('Task not found');
    if (!task.openRoleId) {
      throw new BadRequestException({ message: 'This task was not opened to a role', code: 'ROLE_TASK_NOT_ROLE' });
    }
    /*
      "Started" by facts, not by a list of step names — a custom flow's first
      step ("Backlog") is not started: on the way / on site / working / blocked,
      or this person has joined the crew's work, is.
    */
    const working: string[] = [TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED];
    const joined = await this.prisma.taskEvent.count({
      where: { taskId: task.id, userId: data.userId, eventType: TaskEventType.CREW_JOINED },
    });
    if (working.includes(task.status) || joined > 0 || isWorkOver(task.status)) {
      throw new ConflictException({ message: 'The work has started — leave the crew instead', code: 'ROLE_TASK_STARTED' });
    }
    const reason = data.reason?.trim().slice(0, 500) || null;

    try {
      // The row id from the read above: a second return arriving at once finds nothing to delete.
      await this.prisma.taskAssignee.delete({ where: { id: mine.id } });
    } catch (e) {
      if (e?.code === 'P2025') throw new NotFoundException('Task not found');
      throw e;
    }
    // Back to the role, offered afresh from the first wave — the clock restarts with it. The place itself
    // comes back through syncSpots (asked for − people on it), via onAssigneesChanged below.
    await this.prisma.task.update({ where: { id: task.id }, data: { openWave: 0, openedAt: new Date() } });
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: data.userId,
        eventType: TaskEventType.RETURNED_TO_ROLE,
        metadata: { roleId: task.openRoleId, roleName: task.openRole?.name ?? null, reason },
      },
    });
    await this.tasks.onAssigneesChanged(task.id, [], data.userId);
    // Nobody left on it: back to NEW (the canonical flow only — a custom flow is left as it is).
    await this.prisma.task.updateMany({
      where: { id: task.id, status: { in: [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED] }, assignees: { none: {} } },
      data: { status: TaskStatus.NEW, assignedToId: null },
    });
    emitEvent(this.notifications, taskUpdatedEvent, { task: { id: task.id, organizationId: task.organizationId } });
    await this.offer(task.id, 0, new Set([data.userId])).catch((e) => this.logger.error(`Re-offer for ${task.id} failed: ${e}`));
    return success({ id: task.id }, 'Returned to the role');
  }

  // ── Lists ─────────────────────────────────────────────────────────────

  /**
   * "Open for your role": tasks open to a work role the caller holds, in the
   * workspace they hold it in. One query for their roles, one for the tasks.
   */
  async openForMe(data: Facts) {
    // An access profile without Tasks is offered nothing — the same rule as the picker and the waves.
    const me = await this.prisma.user.findUnique({ where: { id: data.userId }, select: { role: true, enabledModules: true } });
    if (!me || !canReceiveTasks(me)) return success([]);
    const mine = await this.prisma.spaceAssignment.findMany({
      where: { userId: data.userId, workRoleId: { not: null }, ...this.activeNow(), space: { organizationId: data.organizationId } },
      select: { spaceId: true, workRoleId: true },
    });
    if (!mine.length) return success([]);
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: data.organizationId,
        OR: mine.map((m) => ({ spaceId: m.spaceId, openRoleId: m.workRoleId! })),
        openSpotsLeft: { gt: 0 },
        status: { notIn: OVER },
        assignees: { none: { userId: data.userId } },
      },
      select: {
        id: true, title: true, status: true, priority: true, dueDate: true, openedAt: true,
        openSpots: true, openSpotsLeft: true, locationAddress: true, locationLat: true, locationLng: true,
        openRoleId: true, openRole: { select: { name: true } },
        space: { select: { id: true, name: true } },
      },
      orderBy: [{ openedAt: 'asc' }],
      take: 50,
    });
    const here = await this.prisma.workerLastLocation.findUnique({ where: { userId: data.userId }, select: { lat: true, lng: true } });
    const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const rows = tasks
      .filter((t) => isOpenToRole(t))
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        openedAt: t.openedAt,
        openSpots: t.openSpots,
        openSpotsLeft: t.openSpotsLeft,
        roleId: t.openRoleId,
        roleName: t.openRole?.name ?? null,
        spaceId: t.space?.id ?? null,
        spaceName: t.space?.name ?? null,
        locationAddress: t.locationAddress,
        distanceKm: here && t.locationLat != null && t.locationLng != null
          ? Math.round(kmBetween(here, { lat: t.locationLat, lng: t.locationLng }) * 10) / 10
          : null,
      }))
      // Urgent first, then the longest waiting.
      .sort((a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9));
    return success(rows);
  }
}
