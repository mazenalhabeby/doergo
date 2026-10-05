import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  canReceiveTasks,
  dayKeyIn,
  dueWave,
  isOpenToRole,
  isWorkOver,
  kmBetween,
  minutesWaited,
  ONE_AT_A_TIME_STATUSES,
  parseRoleSpots,
  rankCandidates,
  roleOfferTimings,
  runWithCronLock,
  success,
  TaskStatus,
  waveRecipients,
  type CandidateState,
  type RoleCandidate,
} from '@hbcfield/shared';
import { TaskEventType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CoverService } from '../technicians/cover.service';
import { TasksService } from './tasks.service';

/** Statuses that are certainly over — the indexed half of "still open"; `isWorkOver` is the rest. */
const OVER = [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.CLOSED];
const DAY_MS = 86_400_000;

type OpenRole = { id: string; name: string };
type Facts = { userId: string; organizationId: string };

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
export class RolePoolService {
  private readonly logger = new Logger(RolePoolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cover: CoverService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
    @Inject(forwardRef(() => TasksService)) private readonly tasks: TasksService,
  ) {}

  // ── Opening ───────────────────────────────────────────────────────────

  /**
   * The role a task may be opened to: a WORK role of this organization that is
   * in use in this workspace (switched on there, or held by somebody there).
   * Refusals carry a code the screen can word.
   */
  async resolveOpenRole(organizationId: string, spaceId: string | null | undefined, roleId: string): Promise<OpenRole> {
    if (!spaceId) {
      throw new BadRequestException({ message: 'Choose a workspace to open a task to a role', code: 'ROLE_TASK_NEEDS_SPACE' });
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
        throw new BadRequestException({ message: `${role.name} is not used in this workspace`, code: 'ROLE_TASK_ROLE_NOT_HERE' });
      }
    }
    return role;
  }

  /** The columns a task carries when it is opened to a role — for `create` and `setOpenRole`. */
  openColumns(roleId: string, spots: unknown, now = new Date()) {
    const n = parseRoleSpots(spots);
    return { openRoleId: roleId, openSpots: n, openSpotsLeft: n, openedAt: now, openWave: 0 };
  }

  /** After a task is opened (created, or re-opened by the office): the record, then the first wave. */
  async afterOpened(taskId: string, actorId: string, role: OpenRole, spots: number): Promise<void> {
    await this.prisma.taskEvent.create({
      data: { taskId, userId: actorId, eventType: TaskEventType.OPENED_TO_ROLE, metadata: { roleId: role.id, roleName: role.name, spots } },
    });
    // The first wave goes now — a push a minute late is a minute a free person waited for nothing.
    await this.offer(taskId, 0).catch((e) => this.logger.error(`First offer for ${taskId} failed: ${e}`));
  }

  /**
   * The office opens an existing task to a role, changes how many it needs,
   * or closes it again (`roleId: null`). Asks the same right as assigning.
   */
  async setOpenRole(data: Facts & { taskId: string; roleId: string | null; spots?: number; userRole: string; canAssignTasks?: boolean; canViewAllTasks?: boolean; assignSpaceIds?: string[] }) {
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
      await this.prisma.task.update({ where: { id: task.id }, data: { openRoleId: null, openSpots: null, openSpotsLeft: null, openedAt: null, openWave: 0 } });
      this.notifications.emit('task_updated', { task: { id: task.id, organizationId: data.organizationId } });
      return success({ id: task.id, openRoleId: null });
    }

    const role = await this.resolveOpenRole(data.organizationId, task.spaceId, data.roleId);
    const spots = parseRoleSpots(data.spots);
    if (task.openRoleId === role.id && task.openSpots != null && task.openSpotsLeft != null) {
      // Same role, a different number: keep who already took it, and the wait.
      const taken = task.openSpots - task.openSpotsLeft;
      const left = Math.max(0, spots - taken);
      await this.prisma.task.update({ where: { id: task.id }, data: { openSpots: Math.max(spots, taken), openSpotsLeft: left } });
      this.notifications.emit('task_updated', { task: { id: task.id, organizationId: data.organizationId } });
      return success({ id: task.id, openRoleId: role.id, openSpots: Math.max(spots, taken), openSpotsLeft: left });
    }
    await this.prisma.task.update({ where: { id: task.id }, data: this.openColumns(role.id, spots) });
    await this.afterOpened(task.id, data.userId, role, spots);
    this.notifications.emit('task_updated', { task: { id: task.id, organizationId: data.organizationId } });
    return success({ id: task.id, openRoleId: role.id, openSpots: spots, openSpotsLeft: spots });
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
      people.set(h.user.id, { id: h.user.id, name: `${h.user.firstName} ${h.user.lastName}`.trim() });
    }
    const ids = [...people.keys()];
    if (!ids.length) return [];

    const now = new Date();
    const tz = space?.timezone || 'Europe/Berlin';
    const today = dayKeyIn(now, tz);
    const [clocked, active, dueSoon, taken, positions, expected] = await Promise.all([
      this.prisma.timeEntry.findMany({ where: { userId: { in: ids }, status: 'CLOCKED_IN' }, select: { userId: true } }),
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
        where: { userId: { in: ids }, eventType: TaskEventType.TAKEN, createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
        _count: { _all: true },
      }),
      at?.lat != null && at?.lng != null
        ? this.prisma.workerLastLocation.findMany({ where: { userId: { in: ids } }, select: { userId: true, lat: true, lng: true } })
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
          distanceKm: p && at?.lat != null && at?.lng != null ? Math.round(kmBetween(p, { lat: at.lat, lng: at.lng }) * 10) / 10 : null,
          jobsToday: todayCount.get(id) ?? 0,
          takenThisWeek: takenBy.get(id) ?? 0,
        };
      }),
    );
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

  // ── Taking and handing back ──────────────────────────────────────────

  /** Does this person hold the task's open role in its workspace, right now? */
  async holdsOpenRole(task: { openRoleId?: string | null; spaceId?: string | null; openSpotsLeft?: number | null; status?: string | null }, userId: string): Promise<boolean> {
    if (!isOpenToRole(task) || !task.spaceId) return false;
    const row = await this.prisma.spaceAssignment.findFirst({
      where: { userId, spaceId: task.spaceId, workRoleId: task.openRoleId!, ...this.activeNow() },
      select: { user: { select: { role: true, enabledModules: true } } },
    });
    // Holding the role is not enough: an access profile without Tasks is never offered a job.
    return !!row && canReceiveTasks(row.user);
  }

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
      if (task?.openRoleId && (task.openSpotsLeft ?? 0) <= 0) {
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
    const takerName = `${taker?.firstName ?? ''} ${taker?.lastName ?? ''}`.trim();
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
      ? await this.prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId: task.id, userId: data.userId } }, select: { id: true } })
      : null;
    if (!task || !mine) throw new NotFoundException('Task not found');
    if (!task.openRoleId) {
      throw new BadRequestException({ message: 'This task was not opened to a role', code: 'ROLE_TASK_NOT_ROLE' });
    }
    const notStarted: string[] = [TaskStatus.NEW, TaskStatus.ASSIGNED, TaskStatus.ACCEPTED];
    if (!notStarted.includes(task.status)) {
      throw new ConflictException({ message: 'The work has started — leave the crew instead', code: 'ROLE_TASK_STARTED' });
    }
    const reason = data.reason?.trim().slice(0, 500) || null;

    await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignee.delete({ where: { id: mine.id } });
      // Back to the role: one more place, offered afresh from the first wave — the clock restarts with it.
      await tx.task.update({
        where: { id: task.id },
        data: { openSpotsLeft: { increment: 1 }, openWave: 0, openedAt: new Date() },
      });
      // Never more places than were asked for (a stale double return).
      await tx.task.updateMany({ where: { id: task.id, openSpotsLeft: { gt: task.openSpots ?? 1 } }, data: { openSpotsLeft: task.openSpots ?? 1 } });
    });
    await this.prisma.taskEvent.create({
      data: { taskId: task.id, userId: data.userId, eventType: TaskEventType.RETURNED_TO_ROLE, metadata: { roleId: task.openRoleId, roleName: task.openRole?.name ?? null, reason } },
    });
    await this.tasks.onAssigneesChanged(task.id, [], data.userId);
    // Nobody left on it: back to NEW (the canonical flow only — a custom flow is left as it is).
    await this.prisma.task.updateMany({
      where: { id: task.id, status: { in: [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED] }, assignees: { none: {} } },
      data: { status: TaskStatus.NEW, assignedToId: null },
    });
    this.notifications.emit('task_updated', { task: { id: task.id, organizationId: task.organizationId } });
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

  // ── Waves ─────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepCron(): Promise<void> {
    await runWithCronLock(this.prisma, { name: 'task:roleOffers', ttlSeconds: 55, logger: this.logger }, () => this.sweep());
  }

  /**
   * Move every still-open role task to the wave it is due: widen the offer,
   * then tell whoever opened it. Each step is CLAIMED (openWave from → to), so
   * a replica that slipped past the lease cannot send it twice. Bounded.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    const open = await this.prisma.task.findMany({
      where: { openRoleId: { not: null }, openSpotsLeft: { gt: 0 }, openWave: { lt: 2 }, status: { notIn: OVER } },
      select: {
        id: true, status: true, priority: true, openedAt: true, openWave: true, openRoleId: true, openSpotsLeft: true,
        space: { select: { roleOfferWidenMin: true, roleOfferAlertMin: true } },
      },
      orderBy: { openedAt: 'asc' },
      take: 200,
    });
    let moved = 0;
    for (const t of open) {
      if (!t.openedAt || !isOpenToRole(t)) continue;
      const due = dueWave({ openedAt: t.openedAt, priority: t.priority }, now, roleOfferTimings(t.space));
      if (due <= t.openWave) continue;
      const claimed = await this.prisma.task.updateMany({ where: { id: t.id, openWave: t.openWave }, data: { openWave: due } });
      if (claimed.count === 0) continue;
      moved++;
      try {
        if (t.openWave < 1) await this.offer(t.id, 1);
        if (due === 2) await this.alertCreator(t.id, now);
      } catch (e) {
        this.logger.error(`Role offer wave for ${t.id} failed: ${e}`);
      }
    }
    return moved;
  }

  /**
   * Push the task to the people a wave reaches — never twice to one person,
   * never to somebody already on it. Records who was offered it.
   */
  async offer(taskId: string, wave: 0 | 1, alsoExclude: ReadonlySet<string> = new Set()): Promise<string[]> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true, title: true, status: true, organizationId: true, spaceId: true, createdById: true,
        openRoleId: true, openSpotsLeft: true, openedAt: true, locationLat: true, locationLng: true,
        openRole: { select: { name: true } },
        assignees: { select: { userId: true } },
      },
    });
    if (!task || !task.spaceId || !isOpenToRole(task)) return [];
    const ranked = await this.candidates(task.organizationId, task.spaceId, task.openRoleId!, { lat: task.locationLat, lng: task.locationLng });
    const already = await this.offeredTo(task.id, task.openedAt);
    const exclude = new Set([...already, ...alsoExclude, ...task.assignees.map((a) => a.userId), task.createdById]);
    const userIds = waveRecipients(ranked, wave, exclude);
    if (!userIds.length) return [];
    await this.prisma.taskEvent.create({
      data: { taskId: task.id, userId: task.createdById, eventType: TaskEventType.OFFERED, metadata: { wave, userIds } },
    });
    this.notifications.emit('role_task_offered', {
      task: { id: task.id, title: task.title, organizationId: task.organizationId },
      roleName: task.openRole?.name ?? '',
      userIds,
      wave,
    });
    return userIds;
  }

  /** Nobody took it in time: whoever opened it hears so, with the three best to give it to. */
  private async alertCreator(taskId: string, now: Date) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true, title: true, organizationId: true, spaceId: true, createdById: true, openedAt: true,
        openRoleId: true, openSpotsLeft: true, status: true, locationLat: true, locationLng: true,
        openRole: { select: { name: true } },
      },
    });
    if (!task || !task.spaceId || !isOpenToRole(task)) return;
    const ranked = await this.candidates(task.organizationId, task.spaceId, task.openRoleId!, { lat: task.locationLat, lng: task.locationLng });
    const best = ranked.filter((c) => c.state === 'FREE' || c.state === 'BUSY').slice(0, 3).map((c) => c.name);
    this.notifications.emit('role_task_unclaimed', {
      task: { id: task.id, title: task.title, organizationId: task.organizationId },
      roleName: task.openRole?.name ?? '',
      minutes: minutesWaited(task.openedAt, now) ?? 0,
      names: best,
      notifyIds: [task.createdById],
    });
  }

  // ── The report ────────────────────────────────────────────────────────

  /**
   * Per role: how many were opened, taken, still open and overdue, the average
   * minutes to take, and who takes most. From the task rows and TAKEN events —
   * three queries for any period.
   */
  async stats(data: { organizationId: string; spaceIds?: string[]; from?: string; to?: string }) {
    if (data.spaceIds && data.spaceIds.length === 0) return success({ roles: [] });
    const range = {
      ...(data.from ? { gte: new Date(`${data.from}T00:00:00.000Z`) } : {}),
      ...(data.to ? { lte: new Date(`${data.to}T23:59:59.999Z`) } : {}),
    };
    const spaceWhere = data.spaceIds ? { spaceId: { in: data.spaceIds } } : {};
    const [opened, openNow, takes] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['openRoleId'],
        where: { organizationId: data.organizationId, openRoleId: { not: null }, ...spaceWhere, ...(data.from || data.to ? { openedAt: range } : {}) },
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where: { organizationId: data.organizationId, openRoleId: { not: null }, openSpotsLeft: { gt: 0 }, status: { notIn: OVER }, ...spaceWhere },
        select: { openRoleId: true, openWave: true },
      }),
      this.prisma.taskEvent.findMany({
        where: {
          eventType: TaskEventType.TAKEN,
          task: { organizationId: data.organizationId, ...spaceWhere },
          ...(data.from || data.to ? { createdAt: range } : {}),
        },
        select: { userId: true, metadata: true, user: { select: { firstName: true, lastName: true } } },
        take: 5000,
      }),
    ]);
    const roleIds = [...new Set([...opened.map((o) => o.openRoleId!), ...openNow.map((o) => o.openRoleId!)])];
    const roles = await this.prisma.accessRole.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } });
    const out = roles.map((r) => {
      const mine = takes.filter((t) => (t.metadata as any)?.roleId === r.id);
      const waits = mine.map((t) => (t.metadata as any)?.waitedMinutes).filter((n): n is number => typeof n === 'number');
      const byPerson = new Map<string, { name: string; count: number }>();
      for (const t of mine) {
        const cur = byPerson.get(t.userId) ?? { name: `${t.user.firstName} ${t.user.lastName}`.trim(), count: 0 };
        cur.count++;
        byPerson.set(t.userId, cur);
      }
      return {
        roleId: r.id,
        roleName: r.name,
        opened: opened.find((o) => o.openRoleId === r.id)?._count._all ?? 0,
        taken: mine.length,
        avgMinutesToTake: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
        openNow: openNow.filter((o) => o.openRoleId === r.id).length,
        overdue: openNow.filter((o) => o.openRoleId === r.id && o.openWave >= 2).length,
        topTakers: [...byPerson.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      };
    });
    return success({ roles: out.sort((a, b) => a.roleName.localeCompare(b.roleName)) });
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /** An assignment in force now (the shared window rule, without the user). */
  private activeNow(now = new Date()) {
    return { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] };
  }

  /** Everybody already offered this task since it was (re)opened, from its OFFERED events. */
  private async offeredTo(taskId: string, since: Date | null): Promise<Set<string>> {
    const rows = await this.prisma.taskEvent.findMany({
      where: { taskId, eventType: TaskEventType.OFFERED, ...(since ? { createdAt: { gte: since } } : {}) },
      select: { metadata: true },
    });
    return new Set(rows.flatMap((r) => ((r.metadata as any)?.userIds ?? []) as string[]));
  }

  /** Who holds the places — for "Ahmad took it" on a refusal. */
  private async takers(taskId: string): Promise<string[]> {
    const rows = await this.prisma.taskAssignee.findMany({
      where: { taskId },
      select: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    return rows.map((r) => `${r.user.firstName} ${r.user.lastName}`.trim());
  }
}
