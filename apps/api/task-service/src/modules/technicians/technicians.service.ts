import { assertMemberInScope, memberScopeFilter, countLeave as countLeaveDays, dowOf, eachDay, paginated, type DateKey, toISODateString, dayKeyIn } from '@hbcfield/shared';
import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, SERVICE_NAMES, TaskStatus, success } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { findPrior } from '../../common/create-once.util';
import { CoverService } from './cover.service';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
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
    // A weekly schedule set after the clock-in reaches the entries it now covers.
    @Optional() private readonly rematch?: ShiftRematchService,
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
   * Request time off
   */
  async requestTimeOff(dto: RequestTimeOffDto) {
    const { technicianId, organizationId, startDate, endDate, reason } = dto;
    // Only VACATION is deducted from the allowance, so the kind has to be stored
    // rather than inferred from the reason text at read time.
    const type = (dto as any).type ?? 'VACATION';

    // Verify technician belongs to organization
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, organizationId },
    });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    // The same request sent again from the phone's queue: answered before the
    // overlap rule, which would otherwise refuse it as overlapping itself.
    const prior = await findPrior({
      id: dto.id,
      find: (id) => this.prisma.timeOff.findUnique({ where: { id }, include: { technician: { select: { id: true, firstName: true, lastName: true } } } }),
      isSame: (row) => row.technicianId === technicianId,
    });
    if (prior) return success(prior, 'Time-off request already recorded');

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    if (start < new Date()) {
      throw new BadRequestException('Cannot request time off in the past');
    }

    // Check for overlapping time-off requests
    const existingTimeOff = await this.prisma.timeOff.findFirst({
      where: {
        technicianId,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
    });

    if (existingTimeOff) {
      throw new BadRequestException('Time-off request overlaps with an existing request');
    }

    // Only a vacation request is refused for falling on days off; sickness is recorded as it came.
    const workingDays = await this.workingDaysOf(organizationId, technicianId, start, end, type !== 'VACATION');

    const timeOff = await this.prisma.timeOff.create({
      data: {
        ...(dto.id ? { id: dto.id } : {}),
        technicianId,
        startDate: start,
        endDate: end,
        reason,
        type: type as any,
        status: 'PENDING',
        workingDays,
      },
      include: {
        technician: {
          select: { id: true, firstName: true, lastName: true },
        },
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
    const verdict = (
      await this.cover.assessMany(organizationId, [
        { id: timeOff.id, technicianId, startDate: start, endDate: end },
      ])
    ).get(timeOff.id) ?? null;

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
    const exists = await this.prisma.user.findFirst({ where: { id: dto.technicianId, organizationId: dto.organizationId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Employee not found in organization');
    /*
      Somebody else's count shows their rota and days off: only for whoever manages that person —
      the rota permission held in a workspace reaches the people OF that workspace, not the org.
    */
    if (dto.callerId !== dto.technicianId) {
      await assertMemberInScope(this.prisma as any, { userId: dto.technicianId, organizationId: dto.organizationId, scopeSpaceIds: dto.scopeSpaceIds });
    }
    const c = await this.calendarRules.countLeaveFor(dto.organizationId, dto.technicianId, dto.from, dto.to);
    return success({
      from: dto.from, to: dto.to,
      calendarDays: c.calendarDays, counted: c.counted, restDays: c.restDays,
      holidays: c.holidays, byYear: c.byYear,
      days: c.days.map((d) => ({ day: d.day, kind: d.kind, cost: d.cost, holiday: d.holiday ?? null })),
    });
  }

  /** This year's allowance for one person, with what is taken and pending. */
  async getLeaveBalance(dto: { technicianId: string; organizationId: string }) {
    const technician = await this.prisma.user.findFirst({
      where: { id: dto.technicianId, organizationId: dto.organizationId },
      select: { id: true, leaveAllowance: true, organizationId: true, employmentStartDate: true },
    });
    if (!technician) throw new NotFoundException('Employee not found in organization');

    const rows = await this.prisma.timeOff.findMany({
      where: { technicianId: dto.technicianId, type: 'VACATION' as any },
      select: { type: true, status: true, startDate: true, endDate: true },
    });
    return success(await this.leaveBalance(technician, rows as any));
  }

  /**
   * This year's vacation allowance and what is left of it.
   *
   * Deducts APPROVED vacation only. Pending days are reported separately rather
   * than subtracted: a request a manager has not looked at yet is not time the
   * person has taken, and quietly counting it makes the number drop for a
   * booking that may never happen. Showing both lets someone see the optimistic
   * and the committed figure without the page choosing for them.
   *
   * Sick, personal and other absence never touch the allowance — an allowance
   * that deducts sick days is a penalty for being ill.
   */
  private async leaveBalance(
    technician: { id: string; leaveAllowance?: number | null; organizationId?: string | null },
    timeOffs: Array<{ type?: string; status: string; startDate: Date; endDate: Date }>,
  ) {
    // Per-person override, else the organization's default. Null is "use the
    // default"; 0 is a real answer meaning no paid leave, so `??` not `||`.
    let allowance = technician.leaveAllowance ?? null;
    if (allowance === null && technician.organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: technician.organizationId },
        select: { defaultLeaveAllowance: true },
      });
      allowance = org?.defaultLeaveAllowance ?? 25;
    }

    const year = new Date().getFullYear();
    const fullAllowance = allowance ?? 0;

    /*
      Someone who started in July did not earn a full year of vacation, so the
      first year is pro-rated by the months they are actually here — including
      the month they started, because a day worked in a month is a month
      started.

      Only ever from an explicitly recorded start date. createdAt would be the
      tempting fallback and it is the wrong date: an organization importing its
      existing staff makes every account on one afternoon, and pro-rating from
      that would quietly cut months off everyone's allowance for a start date
      none of them had. No date recorded means the full allowance.
    */
    let prorated = false;
    const start = (technician as any).employmentStartDate as Date | null | undefined;
    if (start && new Date(start).getFullYear() === year) {
      const monthsHere = 12 - new Date(start).getMonth();
      // Half days, because a twelfth of 25 is not a whole number and rounding
      // down every time quietly costs people days they are owed.
      allowance = Math.round(((fullAllowance * monthsHere) / 12) * 2) / 2;
      prorated = true;
    }
    /*
      WORKING days, counted inside THIS year only: weekends, rota rest days and holidays cost nothing,
      and a request over New Year draws on each year for its own days (shared calendar/days.ts).
      One rule set for the whole year, then pure arithmetic per request — two or three queries, not
      one per row.
    */
    const yearStart = `${year}-01-01`, yearEnd = `${year}-12-31`;
    const relevant = timeOffs.filter((r) =>
      (r.type ?? 'VACATION') === 'VACATION' && (r.status === 'APPROVED' || r.status === 'PENDING')
      && toISODateString(r.startDate) <= yearEnd && toISODateString(r.endDate) >= yearStart);
    let taken = 0;
    let pending = 0;
    if (relevant.length && technician.organizationId) {
      const { rules, roster } = await this.calendarRules.personRules(technician.organizationId, technician.id, yearStart, yearEnd);
      for (const r of relevant) {
        const from = toISODateString(r.startDate), to = toISODateString(r.endDate);
        const cost = countLeaveDays(from < yearStart ? yearStart : from, to > yearEnd ? yearEnd : to, rules, roster).counted;
        if (r.status === 'APPROVED') taken += cost;
        else pending += cost;
      }
    }

    return {
      year,
      allowance: allowance ?? 0,
      taken,
      pending,
      remaining: (allowance ?? 0) - taken,
      // The screen has to be able to explain a number that is not the round
      // one everybody else has.
      prorated,
      fullAllowance,
      startedOn: prorated && start ? toISODateString(new Date(start)) : null,
    };
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
    const open = withCover ? timeOffs.filter((t) => t.status === 'PENDING') : [];
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
    const workingDays = approved
      ? await this.workingDaysOf(organizationId, timeOff.technicianId, timeOff.startDate, timeOff.endDate, true)
      : undefined;
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
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException('This overlaps an existing time-off entry for the employee');
    }

    const workingDays = data.startDate || data.endDate
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
