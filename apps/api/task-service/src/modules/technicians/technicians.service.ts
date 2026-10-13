import { ApprovalRulesService } from '../../common/approval-rules/approval-rules.service';
import { ABSENCE_WHERE, REQUEST_KINDS, REQUEST_LIMITS, activeAssignmentWhere, assertFoundInOrg, isAbsence, parseRequestInput, requestKindOf, requestKindsOffered, resolveAwayAccess, type RequestInput, type RequestInputError, type RequestKind, assertMemberInScope, memberScopeFilter, dowOf, eachDay, paginated, type DateKey, toISODateString, dayKeyIn } from '@hbcfield/shared';
import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, SERVICE_NAMES, TaskStatus, success } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { findPrior } from '../../common/create-once.util';
import { CoverService } from './cover.service';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import { LeaveLedgerService, leaveYearFor } from './leave-ledger.service';
import { ShiftRematchService } from '../attendance/shift-rematch.service';
import { assertNotSelfDecision } from '../attendance/self-decision';
import {
  GetEmployeeStatsDto,
  GetEmployeePerformanceDto,
  GetEmployeeTaskHistoryDto,
  SetScheduleDto,
  GetScheduleDto,
  RequestTimeOffDto,
  GetTimeOffDto,
  GetOrgTimeOffDto,
  ApproveTimeOffDto,
  CancelTimeOffDto,
  GetAvailabilityDto,
} from './dto';
import { workspaceZone } from '../../common/zone.util';

// Leave dates are Postgres DATEs (stored at midnight UTC), so they are read back
// with toISODateString — the UTC day IS the stored day. Through the server's
// local zone they would move a day for anybody west of Greenwich.

@Injectable()
export class TechniciansService {
  constructor(
    private readonly prisma: PrismaService,
    /*
      Who is told ABOUT this member. Leave asks the organization for time, so the
      question "who hears about it" is the same question attendance already
      answers, and it is answered in one place: explicit watchers chosen on the
      member's Access page, UNION the routing configured on the spaces they work
      in (their per-space override first, the space's own notify roles second).
      Nothing configured anywhere → nobody is told, deliberately.
    */
    private readonly notificationRouting: NotificationRoutingService,
    /*
      Cover is asked in two places here — the approvals list wants a verdict per
      request, and a member asking for days deserves the same answer the approver
      will see. One service, so those two can never disagree.
    */
    private readonly cover: CoverService,
    // What a range of leave COSTS — weekends, rota rest days and holidays left out (shared calendar/days.ts).
    private readonly calendarRules: CalendarRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    // The ONE vacation balance (allowance + adjustments − taken, in the leave year).
    private readonly leaveLedger: LeaveLedgerService,
    // A weekly schedule set after the clock-in reaches the entries it now covers.
    @Optional() private readonly rematch?: ShiftRematchService,
    // Office rules (a threshold → a second approval). Global in the app; absent only in narrow unit tests.
    @Optional() private readonly rules?: ApprovalRulesService,
  ) {}

  /**
   * Get basic stats for an employee
   */
  async getStats(dto: GetEmployeeStatsDto) {
    // A space-granted caller may only read their own crew. The route takes a
    // member id straight from the caller, so this is the boundary.
    await assertMemberInScope(this.prisma, {
      userId: dto.id,
      organizationId: dto.organizationId,
      scopeSpaceIds: (dto as { scopeSpaceIds?: string[] }).scopeSpaceIds,
    });
    const { id, organizationId } = dto;

    // Aggregate in the DB instead of loading every task and counting in JS (M5).
    // One grouped count by status (served by the [assignedToId, status] index) +
    // one filtered count for on-time completions (field-ref updatedAt <= dueDate).
    const [statusGroups, completedOnTime] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        where: { assignedToId: id, organizationId },
        _count: { _all: true },
      }),
      this.prisma.task.count({
        where: {
          assignedToId: id,
          organizationId,
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CLOSED] },
          // On-time = no due date, or finished (updatedAt) on/before the due date.
          OR: [
            { dueDate: null },
            { updatedAt: { lte: this.prisma.task.fields.dueDate } },
          ],
        },
      }),
    ]);

    const countByStatus = new Map<string, number>();
    for (const g of statusGroups) countByStatus.set(g.status, g._count._all);
    const c = (s: TaskStatus) => countByStatus.get(s) || 0;

    const total = [...countByStatus.values()].reduce((a, b) => a + b, 0);
    const completed = c(TaskStatus.COMPLETED) + c(TaskStatus.CLOSED);
    const inProgress =
      c(TaskStatus.IN_PROGRESS) +
      c(TaskStatus.ACCEPTED) +
      c(TaskStatus.EN_ROUTE) +
      c(TaskStatus.ARRIVED);
    const blocked = c(TaskStatus.BLOCKED);

    return success({
      total,
      completed,
      inProgress,
      blocked,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      onTimeRate: completed > 0 ? (completedOnTime / completed) * 100 : 0,
    });
  }

  /**
   * Get detailed performance metrics for an employee
   */
  async getPerformance(dto: GetEmployeePerformanceDto) {
    // A space-granted caller may only read their own crew. The route takes a
    // member id straight from the caller, so this is the boundary.
    await assertMemberInScope(this.prisma, {
      userId: dto.id,
      organizationId: dto.organizationId,
      scopeSpaceIds: (dto as { scopeSpaceIds?: string[] }).scopeSpaceIds,
    });
    const { id, organizationId, startDate, endDate } = dto;

    // Default to last 30 days if no date range provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get tasks in date range
    const tasks = await this.prisma.task.findMany({
      where: {
        assignedToId: id,
        organizationId,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        routeStartedAt: true,
        routeEndedAt: true,
        routeDistance: true,
        space: { select: { timezone: true } },
      },
    });

    // Get time entries in date range — org-scoped so a foreign userId can't leak
    // another tenant's worked hours (S2). TimeEntry carries organizationId.
    const timeEntries = await this.prisma.timeEntry.findMany({
      where: {
        userId: id,
        organizationId,
        clockInAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        totalMinutes: true,
        clockInAt: true,
        location: { select: { timezone: true } },
      },
    });

    // Calculate metrics
    const completed = tasks.filter(
      (t) =>
        t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED,
    ).length;
    const total = tasks.length;

    // On-time completions
    const completedOnTime = tasks.filter((t) => {
      if (t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CLOSED)
        return false;
      if (!t.dueDate) return true;
      return new Date(t.updatedAt) <= new Date(t.dueDate);
    }).length;

    // Total hours worked
    const totalHours =
      timeEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;

    // Average task duration (from route start to completion)
    const tasksWithDuration = tasks.filter(
      (t) =>
        t.routeStartedAt &&
        (t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED),
    );
    const avgTaskDuration =
      tasksWithDuration.length > 0
        ? tasksWithDuration.reduce((sum, t) => {
            const duration =
              new Date(t.updatedAt).getTime() -
              new Date(t.routeStartedAt!).getTime();
            return sum + duration / (1000 * 60); // Convert to minutes
          }, 0) / tasksWithDuration.length
        : 0;

    // Total distance traveled
    const totalDistance = tasks.reduce(
      (sum, t) => sum + (t.routeDistance || 0),
      0,
    );

    // Build daily trends
    const orgZone = await workspaceZone(this.prisma, { organizationId });
    const trends = this.buildDailyTrends(tasks, timeEntries, start, end, orgZone);

    return success({
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      summary: {
        completionRate: total > 0 ? (completed / total) * 100 : 0,
        onTimeRate: completed > 0 ? (completedOnTime / completed) * 100 : 0,
        avgTaskDuration,
        tasksCompleted: completed,
        totalHoursWorked: totalHours,
        totalDistanceTraveled: totalDistance,
      },
      trends,
      comparison: null, // TODO: Calculate comparison with previous period
    });
  }

  /**
   * Get task history for an employee
   */
  async getTaskHistory(dto: GetEmployeeTaskHistoryDto) {
    // A space-granted caller may only read their own crew. The route takes a
    // member id straight from the caller, so this is the boundary.
    await assertMemberInScope(this.prisma, {
      userId: dto.id,
      organizationId: dto.organizationId,
      scopeSpaceIds: (dto as { scopeSpaceIds?: string[] }).scopeSpaceIds,
    });
    const { id, organizationId, status, page = 1, limit = 20 } = dto;
    const { startDate, endDate } = dto as { startDate?: string; endDate?: string };

    const where: any = {
      assignedToId: id,
      organizationId,
    };

    if (status) {
      where.status = status as TaskStatus;
    }

    /*
      An optional due-date window, for "what is already booked for this person
      while they want to be away". Without it the leave drawer would have to
      pull a page of their history and hope the future-dated jobs were on it —
      which for anybody with a long history they would not be.
    */
    if (startDate || endDate) {
      where.dueDate = {
        ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
        ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
      };
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          asset: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginated(tasks, { page, limit, total });
  }

  /**
   * Build daily trends from tasks and time entries
   */
  private buildDailyTrends(
    tasks: Array<{
      status: string;
      createdAt: Date;
      updatedAt: Date;
      space?: { timezone: string | null } | null;
    }>,
    timeEntries: Array<{
      totalMinutes: number | null;
      clockInAt: Date;
      location?: { timezone: string | null } | null;
    }>,
    start: Date,
    end: Date,
    /** Where a record's own workspace names no zone. */
    orgZone: string,
  ) {
    const trends: Array<{
      date: string;
      tasksCompleted: number;
      hoursWorked: number;
    }> = [];

    // Create a map for each day
    const dayMap = new Map<
      string,
      { tasksCompleted: number; hoursWorked: number }
    >();

    // Initialize all days in range
    const current = new Date(start);
    while (current <= end) {
      const dateStr = toISODateString(current);
      dayMap.set(dateStr, { tasksCompleted: 0, hoursWorked: 0 });
      current.setDate(current.getDate() + 1);
    }

    // Count completed tasks per day
    for (const task of tasks) {
      if (
        task.status === TaskStatus.COMPLETED ||
        task.status === TaskStatus.CLOSED
      ) {
        // The day it was finished WHERE it was finished — the UTC day put a
        // 00:30 Vienna completion on the day before.
        const dateStr = dayKeyIn(task.updatedAt, task.space?.timezone || orgZone);
        const day = dayMap.get(dateStr);
        if (day) {
          day.tasksCompleted++;
        }
      }
    }

    // Sum hours worked per day
    for (const entry of timeEntries) {
      const dateStr = dayKeyIn(entry.clockInAt, entry.location?.timezone || orgZone);
      const day = dayMap.get(dateStr);
      if (day && entry.totalMinutes) {
        day.hoursWorked += entry.totalMinutes / 60;
      }
    }

    // Convert map to array
    for (const [date, data] of dayMap) {
      trends.push({
        date,
        tasksCompleted: data.tasksCompleted,
        hoursWorked: Math.round(data.hoursWorked * 10) / 10,
      });
    }

    return trends.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ========================================================================
  // SCHEDULE MANAGEMENT
  // ========================================================================

  /**
   * Set or update a technician's weekly schedule
   */
  async setSchedule(dto: SetScheduleDto) {
    const { technicianId, organizationId, schedule } = dto;

    // Verify technician exists and belongs to organization
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, organizationId },
    });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    // Validate schedule entries
    for (const entry of schedule) {
      if (entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
        throw new BadRequestException('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)');
      }
      if (!this.isValidTimeFormat(entry.startTime) || !this.isValidTimeFormat(entry.endTime)) {
        throw new BadRequestException('Time must be in HH:MM format (e.g., "09:00")');
      }
      // Validate start < end (prevent inverted schedules)
      if (entry.isActive !== false && entry.startTime >= entry.endTime) {
        throw new BadRequestException(`Start time (${entry.startTime}) must be before end time (${entry.endTime}) for day ${entry.dayOfWeek}`);
      }
    }

    // Check for duplicate days
    const days = schedule.map(e => e.dayOfWeek);
    if (new Set(days).size !== days.length) {
      throw new BadRequestException('Duplicate day entries are not allowed');
    }

    // Upsert each schedule entry (delete old, create new for simplicity)
    await this.prisma.$transaction(async (tx) => {
      // Delete existing schedule for this technician
      await tx.technicianSchedule.deleteMany({
        where: { technicianId },
      });

      // Create new schedule entries
      if (schedule.length > 0) {
        await tx.technicianSchedule.createMany({
          data: schedule.map((entry) => ({
            technicianId,
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            isActive: entry.isActive ?? true,
            notes: entry.notes,
          })),
        });
      }
    });

    // Fetch and return updated schedule
    const updatedSchedule = await this.prisma.technicianSchedule.findMany({
      where: { technicianId },
      orderBy: { dayOfWeek: 'asc' },
    });

    if (schedule.some((e) => e.isActive !== false)) {
      this.rematch?.schedule({ organizationId, userId: technicianId, spaceId: null });
    }
    return success(updatedSchedule);
  }

  /**
   * Get a technician's weekly schedule
   */
  async getSchedule(dto: GetScheduleDto) {
    const { technicianId, organizationId } = dto;

    // Verify technician belongs to organization
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, organizationId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    const schedule = await this.prisma.technicianSchedule.findMany({
      where: { technicianId },
      orderBy: { dayOfWeek: 'asc' },
    });

    return success({
      technician,
      schedule,
    });
  }

  private isValidTimeFormat(time: string): boolean {
    const regex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(time);
  }

  // ========================================================================
  // TIME-OFF MANAGEMENT
  // ========================================================================

  /**
   * The workspaces a member could ask a request about, and what each offers.
   *
   * ONE read of their active assignments (with the space's ceiling, its request kinds and the
   * per-assignment override) plus the member — the same facts the clock-in decides "away" from,
   * read through the same `resolveAwayAccess`, so a remote day is only offered where the clock-in
   * would honour it.
   */
  private async requestSpaces(organizationId: string, userId: string) {
    const [member, assignments] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, organizationId },
        select: { id: true, allowRemote: true, role: true },
      }),
      this.prisma.spaceAssignment.findMany({
        where: { ...activeAssignmentWhere(userId), space: { organizationId, isActive: true, isRemote: false } },
        select: {
          allowRemote: true,
          space: { select: { id: true, name: true, lat: true, lng: true, geofencePolicy: true, requestKinds: true } },
        },
      }),
    ]);
    if (!member) throw new NotFoundException('Employee not found in organization');

    const byId = new Map<string, { id: string; name: string; mayWorkRemotely: boolean; kinds: RequestKind[] }>();
    for (const a of assignments) {
      const s = a.space;
      const spaceHasPin = s.lat != null && s.lng != null;
      // Away means something only where there is a site to be away FROM (the clock-in list's rule).
      const mayHere = spaceHasPin && resolveAwayAccess({
        spaceHasPin,
        policy: s.geofencePolicy,
        userAllowRemote: member.allowRemote,
        assignmentAllowRemote: a.allowRemote,
        isAdmin: member.role === 'ADMIN',
      }).allowed;
      const may = mayHere || !!byId.get(s.id)?.mayWorkRemotely;
      byId.set(s.id, { id: s.id, name: s.name, mayWorkRemotely: may, kinds: requestKindsOffered({ enabled: s.requestKinds, mayWorkRemotely: may }) });
    }
    const spaces = [...byId.values()];
    // A kind tied to no workspace: offered when ANY of their workspaces offers it (none = every kind but REMOTE).
    const kinds: RequestKind[] = spaces.length
      ? REQUEST_KINDS.filter((k) => spaces.some((s) => s.kinds.includes(k)))
      : requestKindsOffered({ enabled: [], mayWorkRemotely: false });
    return { spaces, kinds };
  }

  /** What the CALLER may ask for, and where they may ask for a remote day. Only their own. */
  async requestOptions(dto: { userId: string; organizationId: string }) {
    const { spaces, kinds } = await this.requestSpaces(dto.organizationId, dto.userId);
    return success({
      kinds,
      remoteSpaces: spaces.filter((s) => s.kinds.includes('REMOTE')).map((s) => ({ id: s.id, name: s.name })),
    });
  }

  /**
   * Validate a request against the member's workspaces: the workspace is theirs, the kind is
   * offered there, and a remote day is something they may do there. Coded refusals.
   */
  private async assertRequestAllowed(organizationId: string, technicianId: string, value: RequestInput): Promise<void> {
    const ctx = await this.requestSpaces(organizationId, technicianId);
    if (value.spaceId) {
      const mine = ctx.spaces.find((s) => s.id === value.spaceId);
      if (!mine) {
        // Another organization's workspace (or none) answers the same 404 as a missing one.
        const space = await this.prisma.companyLocation.findFirst({ where: { id: value.spaceId }, select: { organizationId: true } });
        assertFoundInOrg(space, organizationId, 'Workspace');
        throw new BadRequestException({ code: 'REQUEST_SPACE_NOT_YOURS', message: 'You are not assigned to that workspace.' });
      }
      if (value.kind === 'REMOTE' && !mine.mayWorkRemotely) {
        throw new BadRequestException({ code: 'REQUEST_REMOTE_NOT_ALLOWED', message: `You are not set up to work away from ${mine.name}.` });
      }
      if (!mine.kinds.includes(value.kind)) {
        throw new BadRequestException({ code: 'REQUEST_KIND_NOT_OFFERED', message: `${mine.name} does not take this kind of request.` });
      }
    } else if (!ctx.kinds.includes(value.kind)) {
      throw new BadRequestException({ code: 'REQUEST_KIND_NOT_OFFERED', message: 'Your workspaces do not take this kind of request.' });
    }
  }

  /**
   * Request something — leave, a remote day, changed hours, overtime agreed in advance, or
   * anything else (shared requests/request-kinds.ts). One record, one approval flow.
   */
  async requestTimeOff(dto: RequestTimeOffDto) {
    const { technicianId, organizationId } = dto;

    // The same request sent again from the phone's queue: answered before the
    // overlap rule, which would otherwise refuse it as overlapping itself.
    const prior = await findPrior({
      id: dto.id,
      find: (id) => this.prisma.timeOff.findUnique({ where: { id }, include: { technician: { select: { id: true, firstName: true, lastName: true } }, space: { select: SPACE_BRIEF } } }),
      isSame: (row) => row.technicianId === technicianId,
    });
    if (prior) return success(prior, 'Time-off request already recorded');

    // ONE reader of a request body, shared with the phone and the web.
    const parsed = parseRequestInput(dto);
    if (!parsed.ok) throw new BadRequestException({ code: parsed.code, message: REQUEST_REFUSALS[parsed.code] });
    const value = parsed.value;
    const leave = isAbsence(value.kind);
    // Only VACATION is deducted from the allowance, so the leave type is stored
    // rather than inferred from the reason text at read time.
    const type = value.type ?? 'VACATION';
    const reason = value.reason ?? undefined;

    // The member is in this organization, the workspace is theirs, the kind is offered.
    await this.assertRequestAllowed(organizationId, technicianId, value);

    const start = new Date(value.startDate);
    const end = new Date(value.endDate);

    /*
      Not in the past. Leave keeps its rule (from tomorrow — the day itself is gone by the time
      anybody decides it); a working-day request may be about TODAY: "may I finish at 18:00".
    */
    if (leave ? start < new Date() : value.startDate < toISODateString(new Date())) {
      throw new BadRequestException({ code: 'REQUEST_IN_PAST', message: 'Cannot request time off in the past' });
    }

    /*
      Overlap. Leave collides only with leave. Any other kind collides with the same kind on
      the same day (two answers to one question) — and with leave: a remote day, changed hours
      or overtime on a day off asks to work on a day the person will not be working.
    */
    const clashes = await this.requestClashes(technicianId, value.kind, start, end);
    const sameKind = clashes.find((c) => c.kind === value.kind);
    if (sameKind) {
      throw new BadRequestException({
        code: 'TIMEOFF_OVERLAP',
        params: { from: toISODateString(sameKind.startDate), to: toISODateString(sameKind.endDate), status: sameKind.status },
        message: 'Time-off request overlaps with an existing request',
      });
    }
    const onLeave = clashes.find((c) => c.kind === 'LEAVE');
    if (onLeave) {
      throw new BadRequestException({
        code: 'REQUEST_OVERLAPS_LEAVE',
        params: { from: toISODateString(onLeave.startDate), to: toISODateString(onLeave.endDate), status: onLeave.status },
        message: 'That day falls in leave already asked for or approved.',
      });
    }

    // Only a vacation request is refused for falling on days off; sickness is recorded as it came.
    // A request that is not leave costs no allowance at all.
    const workingDays = leave ? await this.workingDaysOf(organizationId, technicianId, start, end, type !== 'VACATION') : null;

    const timeOff = await this.prisma.timeOff.create({
      data: {
        ...(dto.id ? { id: dto.id } : {}),
        technicianId,
        kind: value.kind as never,
        startDate: start,
        endDate: end,
        reason,
        type: type as never,
        spaceId: value.spaceId ?? null,
        startTime: value.startTime ?? null,
        endTime: value.endTime ?? null,
        minutes: value.minutes ?? null,
        status: 'PENDING',
        workingDays,
      },
      include: {
        technician: {
          select: { id: true, firstName: true, lastName: true },
        },
        space: { select: SPACE_BRIEF },
      },
    });

    /*
      What this costs the workspace.

      The old version of this counted everyone in the ORGANIZATION who was off
      in the window and named them back to the requester. Three things were
      wrong with it and all three mattered: somebody off in Gmunden does not
      thin cover in Vöcklabruck; it counted people who do not work those days
      anyway; and it was told to the one person who cannot act on it. It is now
      the same verdict the approver will see, computed by the same service.
    */
    // Only leave thins cover; a remote day or changed hours is a day worked.
    const verdict = leave
      ? (await this.cover.assessMany(organizationId, [
          { id: timeOff.id, technicianId, startDate: start, endDate: end },
        ])).get(timeOff.id) ?? null
      : null;

    /*
      Tell whoever is meant to hear about this person.

      Until now this wrote a PENDING row and told nobody at all: the only way a
      request was ever seen was somebody opening the availability calendar and
      noticing the badge. A request nobody is told about is a request nobody
      answers.

      Recipients come from the ONE routing resolver, not from a rule invented
      here. Under the 'attendance' category because leave is about this person's
      working time — the same people, and the same opt-out, as their shifts.
      An empty list is a legitimate answer and is not padded with org admins:
      that is the configured meaning of "nobody watches this member".
    */
    const { ids: recipientIds } = await this.notificationRouting.resolveWatchers(
      technicianId,
      organizationId,
      'attendance',
    );

    if (recipientIds.length > 0) {
      this.notificationClient.emit('time_off_requested', {
        timeOffId: timeOff.id,
        organizationId,
        memberId: technicianId,
        memberName: `${timeOff.technician.firstName} ${timeOff.technician.lastName}`,
        ...requestFacts(timeOff),
        type,
        startDate: toISODateString(start),
        endDate: toISODateString(end),
        reason: reason ?? null,
        // The approver is told what it costs at the same moment they are told
        // it exists, so the notification is worth acting on rather than a
        // prompt to go and look something up.
        cover: verdict,
        recipientIds,
      });
    }

    return success({ ...timeOff, cover: verdict });
  }

  /**
   * Admin: add an already-APPROVED day off for an employee. Unlike
   * requestTimeOff (employee self-service), this allows any date (incl. past,
   * for corrections/backfill) and needs no separate approval step.
   */
  async addTimeOff(data: {
    editorId: string;
    organizationId: string;
    technicianId: string;
    startDate: string; // "YYYY-MM-DD"
    endDate: string; // "YYYY-MM-DD" (inclusive)
    reason?: string;
  }) {
    const technician = await this.prisma.user.findFirst({
      where: { id: data.technicianId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
      throw new BadRequestException('Invalid date');
    }
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (start > end) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    /*
      Block overlapping the same employee's existing time off.

      Two entries covering one day are two answers to "was this person off", and
      everything downstream — absence, payroll, the roster — would pick one of
      them arbitrarily.

      The refusal NAMES the entry it collided with. "This overlaps an existing
      entry" tells somebody they are wrong and then makes them go and find out
      how; the dates and the status are what they need to decide whether to move
      their range, edit the other one, or stop.
    */
    const overlap = await this.prisma.timeOff.findFirst({
      where: {
        technicianId: data.technicianId,
        status: { in: ['PENDING', 'APPROVED'] },
        // The office records LEAVE here; it collides with leave only.
        ...ABSENCE_WHERE,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
      orderBy: { startDate: 'asc' },
    });
    if (overlap) {
      /*
        Thrown with an object payload, not a string.

        `code` and `params` let the client render this in the reader's own
        language — the dialog around it is translated and this sentence was not,
        which is how a German screen answers in English. `message` stays as the
        fallback for any client that does not know the code, so nothing regresses
        while translations are added.
      */
      throw new BadRequestException({
        code: 'TIMEOFF_OVERLAP',
        params: {
          from: toISODateString(overlap.startDate),
          to: toISODateString(overlap.endDate),
          status: overlap.status,
        },
        message:
          `This overlaps time off already recorded for this employee ` +
          `(${toISODateString(overlap.startDate)} to ${toISODateString(overlap.endDate)}, ${overlap.status.toLowerCase()}).`,
      });
    }

    // The office recording a day off is never refused — it records what the range costs.
    const workingDays = await this.workingDaysOf(data.organizationId, data.technicianId, start, end, true);
    const timeOff = await this.prisma.timeOff.create({
      data: {
        technicianId: data.technicianId,
        startDate: start,
        endDate: end,
        reason: data.reason?.trim() || null,
        workingDays,
        status: 'APPROVED',
        approvedById: data.editorId,
        approvedAt: new Date(),
      },
    });

    return success(timeOff, 'Day off added');
  }

  /**
   * Get time-off requests for a technician
   */
  async getTimeOff(dto: GetTimeOffDto) {
    const { technicianId, organizationId, status } = dto;

    // Verify technician belongs to organization
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, organizationId },
    });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    const where: any = { technicianId };
    if (status) {
      where.status = status;
    }

    const timeOffs = await this.prisma.timeOff.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        space: { select: SPACE_BRIEF },
      },
    });

    // Shape unchanged on purpose: mobile reads `data` as an array. The balance
    // is its own call (getLeaveBalance) rather than a new key here.
    return success(timeOffs);
  }

  /**
   * What a leave range costs this person. Refuses a range with no working day in it — a request for
   * a weekend is a mistake the person should see now, not a zero-day row in the manager's queue.
   * `lenient` (a decision on an existing request) never refuses; it records what the range costs.
   */
  /**
   * What a request would collide with — the ONE overlap reader, for sending and
   * for the pre-check before sending. Leave collides only with leave; any other
   * kind with the same kind and with leave.
   */
  async requestClashes(technicianId: string, kind: string, start: Date, end: Date) {
    const leave = isAbsence(kind);
    return this.prisma.timeOff.findMany({
      where: {
        technicianId,
        status: { in: ['PENDING', 'APPROVED'] },
        kind: { in: leave ? ['LEAVE'] : [kind as never, 'LEAVE'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { kind: true, startDate: true, endDate: true, status: true },
      take: 5,
    });
  }

  /** Working days a range costs this member (weekend, holidays and their rota left out). */
  countWorkingDays(organizationId: string, userId: string, start: Date, end: Date): Promise<number> {
    return this.workingDaysOf(organizationId, userId, start, end);
  }

  private async workingDaysOf(organizationId: string, userId: string, start: Date, end: Date, lenient = false): Promise<number> {
    const count = await this.calendarRules.countLeaveFor(
      organizationId, userId, toISODateString(start), toISODateString(end),
    );
    if (!lenient && count.counted === 0) {
      throw new BadRequestException({
        code: 'LEAVE_NO_WORKING_DAYS',
        message: 'Those days are all weekends or holidays — there is nothing to take off.',
      });
    }
    return count.counted;
  }

  /** What a range WOULD cost — the request form shows it before anything is sent. */
  async countLeave(dto: { organizationId: string; technicianId: string; from: string; to: string; callerId?: string; scopeSpaceIds?: string[] }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.from) || !/^\d{4}-\d{2}-\d{2}$/.test(dto.to) || dto.from > dto.to) {
      throw new BadRequestException('Choose a start day on or before the end day');
    }
    // A year at most — a longer range would be counted short, not refused, further down.
    if ((Date.parse(dto.to) - Date.parse(dto.from)) / 86400000 > 366) throw new BadRequestException('Count at most a year at a time');
    const exists = await this.prisma.user.findFirst({
      where: { id: dto.technicianId, organizationId: dto.organizationId },
      select: { id: true, employmentStartDate: true, organization: { select: { leaveYearMode: true } } },
    });
    if (!exists) throw new NotFoundException('Employee not found in organization');
    /*
      Somebody else's count shows their rota and days off: only for whoever manages that person —
      the rota permission held in a workspace reaches the people OF that workspace, not the org.
    */
    if (dto.callerId !== dto.technicianId) {
      await assertMemberInScope(this.prisma as any, { userId: dto.technicianId, organizationId: dto.organizationId, scopeSpaceIds: dto.scopeSpaceIds });
    }
    const c = await this.calendarRules.countLeaveFor(dto.organizationId, dto.technicianId, dto.from, dto.to);
    // The same days split by LEAVE year (calendar or work year — leave ledger): a request over
    // the turn of a leave year draws on each, and the preview keys it on the balance's year.
    const byLeaveYear: Record<string, number> = {};
    for (const d of c.days) {
      if (!d.cost) continue;
      const start = leaveYearFor(exists.organization ?? { leaveYearMode: 'CALENDAR' }, exists, d.day).start;
      byLeaveYear[start] = (byLeaveYear[start] ?? 0) + d.cost;
    }
    return success({
      from: dto.from, to: dto.to,
      calendarDays: c.calendarDays, counted: c.counted, restDays: c.restDays,
      holidays: c.holidays, byYear: c.byYear, byLeaveYear,
      days: c.days.map((d) => ({ day: d.day, kind: d.kind, cost: d.cost, holiday: d.holiday ?? null })),
    });
  }

  /**
   * The vacation balance — computed in ONE place, the leave ledger (leave-ledger.service.ts):
   * allowance + the leave year's adjustments − approved vacation in the leave year.
   */
  async getLeaveBalance(dto: { technicianId: string; organizationId: string; on?: string; year?: number | string }) {
    return success(await this.leaveLedger.getBalance(dto));
  }

  /**
   * Get all time-off requests for an organization
   */
  /**
   * Time off across the organization — or across the spaces a member leads.
   *
   * Leave belongs to a PERSON, not to a site, which is why `TimeOff` has no
   * space column and why this looked unscopeable. But a supervisor's claim was
   * never over the leave: it is over the PEOPLE. So the query narrows through
   * the roster — the crew of the spaces they hold — and needs no schema change
   * to do it.
   *
   * `scopeSpaceIds` follows the three-state convention used everywhere else:
   * undefined means org-wide, and an EMPTY array means granted nowhere and must
   * match nothing. Collapsing those two is how a scoped read becomes an org-wide
   * one by accident.
   */
  async getOrgTimeOff(dto: GetOrgTimeOffDto & { scopeSpaceIds?: string[]; withCover?: boolean }) {
    const { organizationId, status, scopeSpaceIds } = dto;
    // Decided at the gateway, which is where the caller's permissions are known.
    // Default false: a payload that leaks by omission is the wrong default.
    const withCover = dto.withCover === true;

    const where: any = {
      technician: { organizationId },
    };
    if (status) {
      where.status = status;
    }
    if (scopeSpaceIds !== undefined) {
      if (scopeSpaceIds.length === 0) return success([]);
      // One relation filter, served by the space-assignment index — not a
      // roster fetched first and used as an `in` list.
      where.technician = {
        organizationId,
        spaceAssignments: {
          some: {
            spaceId: { in: scopeSpaceIds },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
          },
        },
      };
    }

    /*
      A window, when the screen names one: what touches the dates on screen, plus
      everything still waiting for a decision (it is decided wherever it falls).
      Without it this read is the organization's whole leave history, bounded only
      by the 500 below — slow as history grows, and past 500 rows the leave ON
      screen could be the part cut off.
    */
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (dto.from && dto.to && day.test(dto.from) && day.test(dto.to) && dto.from <= dto.to) {
      where.AND = [{
        OR: [
          { status: 'PENDING' },
          { startDate: { lte: new Date(`${dto.to}T23:59:59.999Z`) }, endDate: { gte: new Date(`${dto.from}T00:00:00.000Z`) } },
        ],
      }];
    }

    const timeOffs = await this.prisma.timeOff.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      include: {
        technician: {
          select: { id: true, firstName: true, lastName: true, email: true, specialty: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        space: { select: SPACE_BRIEF },
      },
      // Bound the payload — the approvals view shows recent/pending, not all-time
      // history (P6). Newest 500 by the order above.
      take: 500,
    });

    /*
      The cover verdict travels WITH the request.

      This is the whole point of the redesign: deciding leave used to mean
      reading this list, then opening the calendar on another tab to work out
      who would be left — and the calendar could not answer, because it only
      ever drew APPROVED leave and so never showed the effect of the decision
      being made. Four extra queries for the whole page, computed once here
      rather than once per row in a browser that would need the entire roster to
      do it at all.

      Only what is still open is assessed. A verdict on a request decided last
      March is arithmetic nobody reads, and it would double the window this has
      to fetch leave for.
    */
    // Only pending LEAVE thins cover — a remote day or changed hours is a day worked.
    const open = withCover ? timeOffs.filter((t) => t.status === 'PENDING' && isAbsence(t.kind)) : [];
    const verdicts = await this.cover.assessMany(
      organizationId,
      open.map((t) => ({
        id: t.id,
        technicianId: t.technicianId,
        startDate: t.startDate,
        endDate: t.endDate,
      })),
    );

    return success(
      timeOffs.map((t) => ({ ...t, cover: verdicts.get(t.id) ?? null })),
    );
  }

  /**
   * Approve or reject a time-off request
   */
  async approveTimeOff(dto: ApproveTimeOffDto & { scopeSpaceIds?: string[] }) {
    const { timeOffId, organizationId, approverId, approved, rejectionReason, scopeSpaceIds } = dto;

    // Find the time-off request. The roster comes with it, so the scope check
    // below costs no second query.
    const timeOff = await this.prisma.timeOff.findUnique({
      where: { id: timeOffId },
      include: {
        technician: {
          select: {
            organizationId: true,
            spaceAssignments: {
              where: { OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
              select: { spaceId: true },
            },
          },
        },
      },
    });

    if (!timeOff) {
      throw new NotFoundException('Time-off request not found');
    }

    // Verify the time-off belongs to the organization
    if (timeOff.technician.organizationId !== organizationId) {
      throw new ForbiddenException('You can only approve time-off requests in your organization');
    }

    /*
      And that this approver has a claim on THIS person.

      The list is narrowed to their crew, but the route takes a request id
      directly — so without this a member who leads one site could approve leave
      for anybody in the company by id. Undefined means org-wide; an empty array
      means nowhere, and refuses.
    */
    if (scopeSpaceIds !== undefined) {
      const theirSpaces = timeOff.technician.spaceAssignments.map((a) => a.spaceId);
      if (!theirSpaces.some((id) => scopeSpaceIds.includes(id))) {
        throw new ForbiddenException('That member does not work in a workspace you manage');
      }
    }

    // Verify the request is pending
    if (timeOff.status !== 'PENDING') {
      throw new BadRequestException('Time-off request has already been processed');
    }

    // Nobody decides their own leave, either way — the overtime rule
    // (attendance/self-decision.ts). Withdrawing your own request is
    // `cancelTimeOff`, not a decision.
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: approverId,
      subjectId: timeOff.technicianId,
      organizationId,
      message: 'You cannot decide your own time off. Ask a manager or an administrator.',
    });

    // Recounted at the decision: a holiday confirmed since the request moves the number once, here.
    const workingDays = approved && isAbsence(timeOff.kind)
      ? await this.workingDaysOf(organizationId, timeOff.technicianId, timeOff.startDate, timeOff.endDate, true)
      : undefined;

    // Office rules: past a threshold this approval is step 1 of 2 and the request stays pending.
    if (!approved) await this.rules?.clear(organizationId, 'request', timeOffId);
    if (approved && this.rules) {
      const days = workingDays ?? (timeOff as { workingDays?: number | null }).workingDays
        ?? Math.round((timeOff.endDate.getTime() - timeOff.startDate.getTime()) / 86_400_000) + 1;
      const spaceIds = (timeOff as { spaceId?: string | null }).spaceId
        ? [(timeOff as { spaceId: string }).spaceId]
        : timeOff.technician.spaceAssignments.map((a) => a.spaceId);
      // Cover is asked only when a rule cares — it is the wallchart's own verdict (CoverService).
      const coverShort = isAbsence(timeOff.kind) && (await this.prisma.approvalRule.count({
        where: { organizationId, kind: 'request', isActive: true, whenCoverShort: true },
      })) > 0
        ? ['short', 'skill'].includes(
            (await this.cover.assessMany(organizationId, [{ id: timeOff.id, technicianId: timeOff.technicianId, startDate: timeOff.startDate, endDate: timeOff.endDate }]))
              .get(timeOff.id)?.level ?? 'ok',
          )
        : false;
      const verdict = await this.rules.gate({
        organizationId,
        kind: 'request',
        itemId: timeOffId,
        facts: { spaceIds, days, coverShort },
        deciderId: approverId,
        subjectId: timeOff.technicianId,
      });
      if (!verdict.finalize) {
        return success({ ...timeOff, stage: 'FIRST_STEP', waitingFor: verdict.roleName }, `Approved — waiting for ${verdict.roleName}`);
      }
    }
    const updated = await this.prisma.timeOff.update({
      where: { id: timeOffId },
      data: {
        ...(workingDays !== undefined ? { workingDays } : {}),
        status: approved ? 'APPROVED' : 'REJECTED',
        approvedById: approverId,
        approvedAt: new Date(),
        rejectionReason: approved ? null : rejectionReason,
      },
      include: {
        technician: {
          select: { id: true, firstName: true, lastName: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        space: { select: SPACE_BRIEF },
      },
    });

    /*
      And tell the person whose leave it is.

      The other half of the loop, and the half that was missing entirely: a
      member submitted a request and then had to keep opening the app to find
      out whether they had the days. This one is addressed, not routed — the
      answer belongs to the person who asked, and to nobody else.
    */
    this.notificationClient.emit('time_off_decided', {
      timeOffId: updated.id,
      organizationId,
      memberId: updated.technicianId,
      ...requestFacts(updated),
      approved,
      rejectionReason: approved ? null : (rejectionReason ?? null),
      startDate: toISODateString(updated.startDate),
      endDate: toISODateString(updated.endDate),
    });

    return success(updated);
  }

  /**
   * Cancel a time-off request (by the technician)
   */
  async cancelTimeOff(dto: CancelTimeOffDto) {
    const { timeOffId, technicianId } = dto;

    const timeOff = await this.prisma.timeOff.findUnique({
      where: { id: timeOffId },
    });

    if (!timeOff) {
      throw new NotFoundException('Time-off request not found');
    }

    // Verify the request belongs to the technician
    if (timeOff.technicianId !== technicianId) {
      throw new ForbiddenException('You can only cancel your own time-off requests');
    }

    // Cancelled already: the same answer again. A phone that sent this without
    // signal may send it twice, and the second must not read as a refusal.
    if (timeOff.status === 'CANCELED') return success(timeOff);

    // Can only cancel pending requests
    if (timeOff.status !== 'PENDING') {
      throw new BadRequestException({
        message: 'This request was already decided, so it can no longer be cancelled',
        code: 'TIME_OFF_DECIDED',
      });
    }

    const updated = await this.prisma.timeOff.update({
      where: { id: timeOffId },
      data: { status: 'CANCELED' },
    });

    return success(updated);
  }

  /** Admin edit of an existing day off (dates / reason), scoped to the org. */
  async updateTimeOff(data: {
    organizationId: string;
    timeOffId: string;
    startDate?: string; // "YYYY-MM-DD"
    endDate?: string; // "YYYY-MM-DD" (inclusive)
    reason?: string | null;
  }) {
    const timeOff = await this.prisma.timeOff.findFirst({
      where: { id: data.timeOffId, technician: { organizationId: data.organizationId } },
    });
    if (!timeOff) {
      throw new NotFoundException('Time-off request not found');
    }
    if (data.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) {
      throw new BadRequestException('Invalid date');
    }
    if (data.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
      throw new BadRequestException('Invalid date');
    }
    const start = data.startDate ? new Date(data.startDate) : timeOff.startDate;
    const end = data.endDate ? new Date(data.endDate) : timeOff.endDate;
    if (start > end) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    // Block overlap with the SAME employee's OTHER time off (exclude this one).
    const overlap = await this.prisma.timeOff.findFirst({
      where: {
        id: { not: data.timeOffId },
        technicianId: timeOff.technicianId,
        status: { in: ['PENDING', 'APPROVED'] },
        // Two answers to the same question: the same kind on the same day.
        kind: timeOff.kind,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException('This overlaps an existing time-off entry for the employee');
    }

    const workingDays = (data.startDate || data.endDate) && isAbsence(timeOff.kind)
      ? await this.workingDaysOf(data.organizationId, timeOff.technicianId, start, end, true)
      : undefined;
    const updated = await this.prisma.timeOff.update({
      where: { id: data.timeOffId },
      data: {
        ...(workingDays !== undefined ? { workingDays } : {}),
        ...(data.startDate ? { startDate: start } : {}),
        ...(data.endDate ? { endDate: end } : {}),
        ...(data.reason !== undefined ? { reason: data.reason?.trim() || null } : {}),
      },
    });
    return success(updated, 'Day off updated');
  }

  /** Admin delete of a day off, scoped to the org. */
  async adminDeleteTimeOff(data: { organizationId: string; timeOffId: string }) {
    const timeOff = await this.prisma.timeOff.findFirst({
      where: { id: data.timeOffId, technician: { organizationId: data.organizationId } },
      select: { id: true },
    });
    if (!timeOff) {
      throw new NotFoundException('Time-off request not found');
    }
    await this.prisma.timeOff.delete({ where: { id: data.timeOffId } });
    return success({ id: data.timeOffId }, 'Day off removed');
  }

  // ========================================================================
  // AVAILABILITY QUERIES
  // ========================================================================

  /**
   * Get availability for all technicians on a specific date or date range
   */
  async getAvailability(dto: GetAvailabilityDto) {
    const { organizationId, date, startDate, endDate, scopeSpaceIds } = dto;
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // The days to answer, as calendar dates (YYYY-MM-DD) — see `availabilityDays`.
    const days = availabilityDays({ date, startDate, endDate });
    if (days.length === 0) return success([]);

    // Collect unique dayOfWeek values needed
    const daysOfWeek = [...new Set(days.map((d) => dowOf(d)))];

    // Time off is a @db.Date column (UTC midnight), so the range bounds are the same instants.
    const rangeStart = new Date(`${days[0]}T00:00:00.000Z`);
    const rangeEnd = new Date(`${days[days.length - 1]}T00:00:00.000Z`);

    const technicians = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: 'EMPLOYEE',
        isActive: true,
        // ⚠️ A reader allowed in SOME workspaces sees only the people in them —
        // availability shows who is off and why it is not anybody else's business.
        ...memberScopeFilter(scopeSpaceIds),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        schedules: {
          where: { dayOfWeek: { in: daysOfWeek }, isActive: true },
        },
        timeOffRequests: {
          where: {
            status: 'APPROVED',
            ...ABSENCE_WHERE,
            startDate: { lte: rangeEnd },
            endDate: { gte: rangeStart },
          },
        },
        // Include space assignments for grouping
        spaceAssignments: {
          where: { effectiveTo: null }, // Only active assignments
          select: {
            isPrimary: true,
            space: { select: { id: true, name: true, timezone: true } },
          },
        },
      },
    });

    // Build availability for each date
    const dayResults = days.map((dateStr) => {
      const dayOfWeek = dowOf(dateStr);

      const availability = technicians.map((tech: any) => {
        const schedule = tech.schedules?.find((s: any) => s.dayOfWeek === dayOfWeek) || null;
        const timeOffRecord = tech.timeOffRequests?.find(
          (t: any) => dateKeyOf(t.startDate) <= dateStr && dateKeyOf(t.endDate) >= dateStr,
        );
        const onTimeOff = !!timeOffRecord;
        const hasSchedule = schedule !== null;

        // Resolve primary space
        const primaryAssignment = tech.spaceAssignments?.find((a: any) => a.isPrimary);
        const firstAssignment = tech.spaceAssignments?.[0];
        const space = primaryAssignment?.space || firstAssignment?.space || null;

        return {
          id: tech.id,
          firstName: tech.firstName,
          lastName: tech.lastName,
          position: tech.position,
          isAvailable: hasSchedule && !onTimeOff,
          onTimeOff,
          space: space ? { id: space.id, name: space.name } : null,
          schedule: schedule
            ? {
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                notes: schedule.notes,
              }
            : null,
          timeOff: timeOffRecord
            ? {
                startDate: timeOffRecord.startDate,
                endDate: timeOffRecord.endDate,
                reason: timeOffRecord.reason,
              }
            : null,
        };
      });

      return {
        date: dateStr,
        dayOfWeek,
        dayName: DAY_NAMES[dayOfWeek],
        technicians: availability,
        summary: {
          total: technicians.length,
          available: availability.filter((a) => a.isAvailable).length,
          onTimeOff: availability.filter((a) => a.onTimeOff).length,
          notScheduled: availability.filter((a) => !a.schedule).length,
        },
      };
    });

    // If single date was requested, return single object (backward compatible)
    if (!startDate || !endDate) {
      return success(dayResults[0]);
    }

    // Range request: return array
    return success(dayResults);
  }
}

/** Availability ranges are capped so a far-future endDate cannot fan out N days × M people (L8). */
export const AVAILABILITY_MAX_SPAN_DAYS = 92;

/** A @db.Date value (UTC midnight) or an ISO string, as its calendar date. */
function dateKeyOf(v: Date | string): DateKey {
  return (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
}

/**
 * Which calendar days an availability request answers, each exactly once.
 *
 * Stepped as DATE KEYS (`eachDay`, the calendar module's walker), never as a local Date with
 * `setDate(+1)`: `new Date('2026-10-13')` is UTC midnight, and stepping it in the server's zone
 * moves it by 23 or 25 hours across a DST change — on 25 Oct in Vienna it lands at 01:00 UTC on
 * the 26th, past `end`, and the last day was silently dropped. West of UTC the same Date is the
 * evening BEFORE, so `getDay()` also named the wrong weekday. A date key has no zone.
 */
export function availabilityDays(q: { date?: string; startDate?: string; endDate?: string }, now = new Date()): DateKey[] {
  if (q.startDate && q.endDate) {
    const from = dateKeyOf(q.startDate);
    const to = dateKeyOf(q.endDate);
    const days = eachDay(from, to, AVAILABILITY_MAX_SPAN_DAYS + 2);
    if (days.length > AVAILABILITY_MAX_SPAN_DAYS + 1) {
      throw new BadRequestException(`Date range too large (max ${AVAILABILITY_MAX_SPAN_DAYS} days)`);
    }
    return days;
  }
  // Single day: the one asked for, else today — the same UTC date this endpoint always used.
  return [q.date ? dateKeyOf(q.date) : toISODateString(now)];
}

/** The workspace on a request, as every response carries it. */
const SPACE_BRIEF = { id: true, name: true } as const;

/** English fallbacks for the shared parser's coded refusals; clients translate by `code`. */
export const REQUEST_REFUSALS: Record<RequestInputError, string> = {
  REQUEST_KIND_INVALID: 'That is not a kind of request.',
  REQUEST_DATES_INVALID: 'Choose a start day on or before the end day.',
  REQUEST_TYPE_INVALID: 'That is not a kind of leave.',
  REQUEST_SPACE_REQUIRED: 'Choose the workspace.',
  REQUEST_TIME_INVALID: 'Give a start and/or end time (HH:MM), the end after the start.',
  REQUEST_MINUTES_INVALID: `Overtime is between ${REQUEST_LIMITS.OVERTIME_MIN_MINUTES} and ${REQUEST_LIMITS.OVERTIME_MAX_MINUTES} minutes.`,
  REQUEST_REASON_REQUIRED: 'Say what you are asking for.',
  REQUEST_REASON_TOO_LONG: `Keep the reason under ${REQUEST_LIMITS.REASON_MAX} characters.`,
  REQUEST_TOO_MANY_DAYS: `A remote request covers at most ${REQUEST_LIMITS.REMOTE_MAX_DAYS} days.`,
};

/** What a notification needs to name the request (the kind, where, the hours, the minutes). */
function requestFacts(r: {
  kind?: string | null;
  space?: { name: string } | null;
  startTime?: string | null;
  endTime?: string | null;
  minutes?: number | null;
}) {
  return {
    kind: requestKindOf(r.kind),
    spaceName: r.space?.name ?? null,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
    minutes: r.minutes ?? null,
  };
}
