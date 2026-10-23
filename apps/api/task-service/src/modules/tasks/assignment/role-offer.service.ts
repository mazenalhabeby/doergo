import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  PrismaService,
  personName,
  activeWindowWhere,
  zoneOf,
  canReceiveTasks,
  dayKeyIn,
  isOpenToRole,
  kmBetween,
  ONE_AT_A_TIME_STATUSES,
  rankCandidates,
  waveRecipients,
  type CandidateState,
  type RoleCandidate,
  lastPoints,
  success,
  workRolesByName,
} from '@hbcfield/shared';
import { TaskEventType } from '@prisma/client';
import { CoverService } from '../../technicians/cover.service';
import { OVER, DAY_MS, Facts } from './role-pool-helpers';
import { RoleOpeningService } from './role-opening.service';
import { emitEvent, roleTaskOfferedEvent } from '@hbcfield/shared/microservices';

/**
 * Who could take a task open to a role: the roles a workspace offers, the office's preview before
 * opening, the candidates ranked by the shared rule, and offering it to the people a wave reaches —
 * used when it is opened, handed back, and by the minute sweep.
 */
@Injectable()
export class RoleOfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cover: CoverService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
    /** Which role it is — resolved the same way as opening it. */
    private readonly opening: RoleOpeningService,
  ) {}

  // ── Before it is opened ─────────────────────────────────────────────

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
      where: {
        spaceId: data.spaceId,
        workRoleId: { not: null },
        ...activeWindowWhere(new Date()),
        user: { isActive: true },
      },
      _count: { _all: true },
    });
    const count = new Map(holders.map((h) => [h.workRoleId!, h._count._all]));
    const roles = await workRolesByName(this.prisma, data.organizationId, [
      ...new Set([...space.workRoleIds, ...count.keys()]),
    ]);
    return success(roles.map((r) => ({ id: r.id, name: r.name, holders: count.get(r.id) ?? 0 })));
  }

  /**
   * What the office sees before saving: how many hold the role here, how many
   * are free now, and the best ten. Read-only; asks the right to assign.
   */
  async preview(data: Facts & { spaceId: string; roleId: string; lat?: number | null; lng?: number | null }) {
    const role = await this.opening.resolveOpenRole(data.organizationId, data.spaceId, data.roleId);
    const ranked = await this.candidates(data.organizationId, data.spaceId, role.id, {
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    });
    const count = (s: CandidateState) => ranked.filter((c) => c.state === s).length;
    return success({
      role,
      total: ranked.length,
      free: count('FREE'),
      busy: count('BUSY'),
      notWorking: count('NOT_WORKING'),
      onLeave: count('ON_LEAVE'),
      candidates: ranked.slice(0, 10).map((c) => ({
        userId: c.userId,
        name: c.name,
        state: c.state,
        distanceKm: c.distanceKm,
        jobsToday: c.jobsToday,
        takenThisWeek: c.takenThisWeek,
      })),
    });
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
        ? lastPoints(this.prisma, ids)
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
    emitEvent(this.notifications, roleTaskOfferedEvent, {
      task: { id: task.id, title: task.title, organizationId: task.organizationId },
      roleName: task.openRole?.name ?? '',
      userIds,
      wave,
    });
    return userIds;
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /** An assignment in force now (the shared window rule, without the user). */
  private activeNow(now = new Date()) {
    return { ...activeWindowWhere(now) };
  }

  /** Everybody already offered this task since it was (re)opened, from its OFFERED events. */
  private async offeredTo(taskId: string, since: Date | null): Promise<Set<string>> {
    const rows = await this.prisma.taskEvent.findMany({
      where: { taskId, eventType: TaskEventType.OFFERED, ...(since ? { createdAt: { gte: since } } : {}) },
      select: { metadata: true },
    });
    return new Set(rows.flatMap((r) => (r.metadata as { userIds?: string[] } | null)?.userIds ?? []));
  }
}
