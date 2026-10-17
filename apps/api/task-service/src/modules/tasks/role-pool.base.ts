import { BadRequestException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  personName,
  activeWindowWhere,
  zoneOf,
  canReceiveTasks,
  dayKeyIn,
  isOpenToRole,
  kmBetween,
  ONE_AT_A_TIME_STATUSES,
  parseRoleSpots,
  rankCandidates,
  waveRecipients,
  type CandidateState,
  type RoleCandidate,
} from '@hbcfield/shared';
import { TaskEventType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CoverService } from '../technicians/cover.service';
import { TasksService } from './tasks.service';
import { holdsOpenRole as holdsOpenRoleRule } from '@hbcfield/shared';
import { OVER, DAY_MS, ROLE_WAVE_CLOSED, OpenRole } from './role-pool-helpers';

/**
 * What the role-pool services share: who holds a role now, the open role's columns
 * and places, who is offered it, who took it.
 */
@Injectable()
export abstract class RolePoolBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly cover: CoverService,
    @Inject('NOTIFICATION_SERVICE') protected readonly notifications: ClientProxy,
    @Inject(forwardRef(() => TasksService)) protected readonly tasks: TasksService,
  ) {}

  // ── Opening ───────────────────────────────────────────────────────────

  /**
   * The role a task may be opened to: a WORK role of this organization that is
   * in use in this workspace (switched on there, or held by somebody there).
   * Refusals carry a code the screen can word.
   */
  async resolveOpenRole(organizationId: string, spaceId: string | null | undefined, roleId: string): Promise<OpenRole> {
    if (!spaceId) {
      throw new BadRequestException({
        message: 'Choose a workspace to open a task to a role',
        code: 'ROLE_TASK_NEEDS_SPACE',
      });
    }
    const [role, space] = await Promise.all([
      this.prisma.accessRole.findFirst({
        where: { id: roleId, organizationId, kind: 'WORK' },
        select: { id: true, name: true },
      }),
      this.prisma.companyLocation.findFirst({
        where: { id: spaceId, organizationId },
        select: { workRoleIds: true },
      }),
    ]);
    if (!role || !space) {
      throw new BadRequestException({ message: 'That work role does not exist here', code: 'ROLE_TASK_ROLE_UNKNOWN' });
    }
    if (!space.workRoleIds.includes(role.id)) {
      const holder = await this.prisma.spaceAssignment.findFirst({
        where: { spaceId, workRoleId: role.id, ...this.activeNow() },
        select: { id: true },
      });
      if (!holder) {
        throw new BadRequestException({
          message: `${role.name} is not used in this workspace`,
          code: 'ROLE_TASK_ROLE_NOT_HERE',
        });
      }
    }
    return role;
  }

  /** The columns a task carries when it is opened to a role — for `create` and `setOpenRole`. */
  openColumns(roleId: string, spots: unknown, now = new Date()) {
    const n = parseRoleSpots(spots);
    return { openRoleId: roleId, openSpots: n, openSpotsLeft: n, openedAt: now, openWave: 0 };
  }

  /**
   * The places left = asked for − people on the task, however the crew changed
   * (a take, a hand-back, the office's own picker, a decline). One statement,
   * computed in the database, so it can never drift from the crew rows or race
   * a take into a wrong absolute number. Nothing for a task not open to a role.
   */
  async syncSpots(taskId: string): Promise<void> {
    // openWave 3 = closed at a finished step: places never reopen on it.
    await this.prisma.$executeRaw`
      UPDATE "tasks" t
      SET "openSpotsLeft" = GREATEST(0, t."openSpots" - (SELECT COUNT(*) FROM "task_assignees" a WHERE a."taskId" = t."id"))::int
      WHERE t."id" = ${taskId} AND t."openRoleId" IS NOT NULL AND t."openSpots" IS NOT NULL AND t."openWave" < ${ROLE_WAVE_CLOSED}`;
  }

  // ── Who could take it ─────────────────────────────────────────────────

  /**
   * Everybody holding the role in the workspace, with what is known about them
   * now — ranked by the shared rule. Six queries for the whole role, never one
   * per person: holders, clock, active jobs, today's jobs, recent takes, last
   * position (+ the rota/leave pair from CoverService).
   */
  async candidates(
    organizationId: string,
    spaceId: string,
    roleId: string,
    at?: { lat: number | null; lng: number | null } | null,
  ): Promise<(RoleCandidate & { state: CandidateState })[]> {
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: spaceId, organizationId },
      select: { timezone: true },
    });
    const holders = await this.prisma.spaceAssignment.findMany({
      where: { spaceId, workRoleId: roleId, ...this.activeNow(), user: { isActive: true, organizationId } },
      select: { user: { select: { id: true, firstName: true, lastName: true, role: true, enabledModules: true } } },
    });
    const people = new Map<string, { id: string; name: string }>();
    for (const h of holders) {
      if (!canReceiveTasks(h.user)) continue;
      people.set(h.user.id, { id: h.user.id, name: personName(h.user) });
    }
    const ids = [...people.keys()];
    if (!ids.length) return [];

    const now = new Date();
    const tz = zoneOf(space?.timezone);
    const today = dayKeyIn(now, tz);
    const [clocked, active, dueSoon, taken, positions, expected] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: { userId: { in: ids }, status: 'CLOCKED_IN' },
        select: { userId: true },
      }),
      this.prisma.task.findMany({
        where: { organizationId, assignedToId: { in: ids }, status: { in: [...ONE_AT_A_TIME_STATUSES] } },
        select: { assignedToId: true },
      }),
      // Jobs due around today; which of them are TODAY is decided in the workspace's zone below.
      this.prisma.task.findMany({
        where: {
          organizationId,
          assignedToId: { in: ids },
          status: { notIn: OVER },
          dueDate: { gte: new Date(now.getTime() - DAY_MS), lte: new Date(now.getTime() + DAY_MS) },
        },
        select: { assignedToId: true, dueDate: true },
      }),
      this.prisma.taskEvent.groupBy({
        by: ['userId'],
        where: {
          userId: { in: ids },
          eventType: TaskEventType.TAKEN,
          createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
        },
        _count: { _all: true },
      }),
      at?.lat != null && at?.lng != null
        ? this.prisma.workerLastLocation.findMany({
            where: { userId: { in: ids } },
            select: { userId: true, lat: true, lng: true },
          })
        : Promise.resolve([] as { userId: string; lat: number; lng: number }[]),
      this.cover.expectedToday(organizationId, spaceId, tz),
    ]);

    const clockedSet = new Set(clocked.map((c) => c.userId));
    const activeSet = new Set(active.map((a) => a.assignedToId));
    const todayCount = new Map<string, number>();
    for (const t of dueSoon) {
      if (t.assignedToId && t.dueDate && dayKeyIn(t.dueDate, tz) === today) {
        todayCount.set(t.assignedToId, (todayCount.get(t.assignedToId) ?? 0) + 1);
      }
    }
    const takenBy = new Map(taken.map((t) => [t.userId, t._count._all]));
    const posBy = new Map(positions.map((p) => [p.userId, p]));

    return rankCandidates(
      ids.map((id) => {
        const p = posBy.get(id);
        const e = expected.get(id);
        return {
          userId: id,
          name: people.get(id)!.name,
          clockedIn: clockedSet.has(id),
          onActiveJob: activeSet.has(id),
          onLeave: e?.onLeave ?? false,
          // Not on this workspace's roster at all (e.g. a role held elsewhere too) counts as rostered.
          rosteredToday: e?.rostered ?? true,
          distanceKm:
            p && at?.lat != null && at?.lng != null
              ? Math.round(kmBetween(p, { lat: at.lat, lng: at.lng }) * 10) / 10
              : null,
          jobsToday: todayCount.get(id) ?? 0,
          takenThisWeek: takenBy.get(id) ?? 0,
        };
      }),
    );
  }

  // ── Taking and handing back ──────────────────────────────────────────

  /** Does this person hold the task's open role in its workspace, right now? (role-holder.ts — one rule) */
  async holdsOpenRole(
    task: {
      openRoleId?: string | null;
      spaceId?: string | null;
      openSpotsLeft?: number | null;
      status?: string | null;
    },
    userId: string,
  ): Promise<boolean> {
    return holdsOpenRoleRule(this.prisma as never, task, userId);
  }

  /**
   * Push the task to the people a wave reaches — never twice to one person,
   * never to somebody already on it. Records who was offered it.
   */
  async offer(taskId: string, wave: 0 | 1, alsoExclude: ReadonlySet<string> = new Set()): Promise<string[]> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        status: true,
        organizationId: true,
        spaceId: true,
        createdById: true,
        openRoleId: true,
        openSpotsLeft: true,
        openedAt: true,
        locationLat: true,
        locationLng: true,
        openRole: { select: { name: true } },
        assignees: { select: { userId: true } },
      },
    });
    if (!task || !task.spaceId || !isOpenToRole(task)) return [];
    const ranked = await this.candidates(task.organizationId, task.spaceId, task.openRoleId!, {
      lat: task.locationLat,
      lng: task.locationLng,
    });
    const already = await this.offeredTo(task.id, task.openedAt);
    const exclude = new Set([...already, ...alsoExclude, ...task.assignees.map((a) => a.userId), task.createdById]);
    const userIds = waveRecipients(ranked, wave, exclude);
    if (!userIds.length) return [];
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: task.createdById,
        eventType: TaskEventType.OFFERED,
        metadata: { wave, userIds },
      },
    });
    this.notifications.emit('role_task_offered', {
      task: { id: task.id, title: task.title, organizationId: task.organizationId },
      roleName: task.openRole?.name ?? '',
      userIds,
      wave,
    });
    return userIds;
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /** An assignment in force now (the shared window rule, without the user). */
  protected activeNow(now = new Date()) {
    return { ...activeWindowWhere(now) };
  }

  /** Everybody already offered this task since it was (re)opened, from its OFFERED events. */
  protected async offeredTo(taskId: string, since: Date | null): Promise<Set<string>> {
    const rows = await this.prisma.taskEvent.findMany({
      where: { taskId, eventType: TaskEventType.OFFERED, ...(since ? { createdAt: { gte: since } } : {}) },
      select: { metadata: true },
    });
    return new Set(rows.flatMap((r) => ((r.metadata as any)?.userIds ?? []) as string[]));
  }

  /** Who holds the places — for "Ahmad took it" on a refusal. */
  protected async takers(taskId: string): Promise<string[]> {
    const rows = await this.prisma.taskAssignee.findMany({
      where: { taskId },
      select: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    return rows.map((r) => personName(r.user));
  }
}
