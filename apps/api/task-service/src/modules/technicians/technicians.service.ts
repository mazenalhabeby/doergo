import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService, TaskStatus, success } from '@doergo/shared';
import {
  GetTechnicianStatsDto,
  GetTechnicianPerformanceDto,
  GetTechnicianTaskHistoryDto,
  SetScheduleDto,
  GetScheduleDto,
  RequestTimeOffDto,
  GetTimeOffDto,
  ApproveTimeOffDto,
  CancelTimeOffDto,
  GetAvailabilityDto,
} from './dto';

@Injectable()
export class TechniciansService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get basic stats for a technician
   */
  async getStats(dto: GetTechnicianStatsDto) {
    const { id, organizationId } = dto;

    const tasks = await this.prisma.task.findMany({
      where: {
        assignedToId: id,
        organizationId,
      },
      select: {
        status: true,
        dueDate: true,
        updatedAt: true,
      },
    });

    const total = tasks.length;
    const completed = tasks.filter(
      (t) =>
        t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED,
    ).length;
    const inProgress = tasks.filter(
      (t) =>
        t.status === TaskStatus.IN_PROGRESS ||
        t.status === TaskStatus.ACCEPTED ||
        t.status === TaskStatus.EN_ROUTE ||
        t.status === TaskStatus.ARRIVED,
    ).length;
    const blocked = tasks.filter(
      (t) => t.status === TaskStatus.BLOCKED,
    ).length;

    // Calculate on-time completion rate
    const completedTasks = tasks.filter(
      (t) =>
        t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED,
    );
    const completedOnTime = completedTasks.filter((t) => {
      if (!t.dueDate) return true;
      return new Date(t.updatedAt) <= new Date(t.dueDate);
    }).length;

    return success({
      total,
      completed,
      inProgress,
      blocked,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      onTimeRate:
        completedTasks.length > 0
          ? (completedOnTime / completedTasks.length) * 100
          : 0,
    });
  }

  /**
   * Get detailed performance metrics for a technician
   */
  async getPerformance(dto: GetTechnicianPerformanceDto) {
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
      },
    });

    // Get time entries in date range
    const timeEntries = await this.prisma.timeEntry.findMany({
      where: {
        userId: id,
        clockInAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        totalMinutes: true,
        clockInAt: true,
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
    const trends = this.buildDailyTrends(tasks, timeEntries, start, end);

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
   * Get task history for a technician
   */
  async getTaskHistory(dto: GetTechnicianTaskHistoryDto) {
    const { id, organizationId, status, page = 1, limit = 20 } = dto;

    const where: any = {
      assignedToId: id,
      organizationId,
    };

    if (status) {
      where.status = status as TaskStatus;
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

    return {
      success: true,
      data: tasks,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Build daily trends from tasks and time entries
   */
  private buildDailyTrends(
    tasks: Array<{
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>,
    timeEntries: Array<{
      totalMinutes: number | null;
      clockInAt: Date;
    }>,
    start: Date,
    end: Date,
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
      const dateStr = current.toISOString().split('T')[0];
      dayMap.set(dateStr, { tasksCompleted: 0, hoursWorked: 0 });
      current.setDate(current.getDate() + 1);
    }

    // Count completed tasks per day
    for (const task of tasks) {
      if (
        task.status === TaskStatus.COMPLETED ||
        task.status === TaskStatus.CLOSED
      ) {
        const dateStr = task.updatedAt.toISOString().split('T')[0];
        const day = dayMap.get(dateStr);
        if (day) {
          day.tasksCompleted++;
        }
      }
    }

    // Sum hours worked per day
    for (const entry of timeEntries) {
      const dateStr = entry.clockInAt.toISOString().split('T')[0];
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
      throw new NotFoundException('Technician not found in organization');
    }

    // Validate schedule entries
    for (const entry of schedule) {
      if (entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
        throw new BadRequestException('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)');
      }
      if (!this.isValidTimeFormat(entry.startTime) || !this.isValidTimeFormat(entry.endTime)) {
        throw new BadRequestException('Time must be in HH:MM format (e.g., "09:00")');
      }
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
      throw new NotFoundException('Technician not found in organization');
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

    // Verify technician belongs to organization
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, organizationId },
    });

    if (!technician) {
      throw new NotFoundException('Technician not found in organization');
    }

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

    const timeOff = await this.prisma.timeOff.create({
      data: {
        technicianId,
        startDate: start,
        endDate: end,
        reason,
        status: 'PENDING',
      },
      include: {
        technician: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return success(timeOff);
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
      throw new NotFoundException('Technician not found in organization');
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

    return success(timeOffs);
  }

  /**
   * Approve or reject a time-off request
   */
  async approveTimeOff(dto: ApproveTimeOffDto) {
    const { timeOffId, organizationId, approverId, approved, rejectionReason } = dto;

    // Find the time-off request
    const timeOff = await this.prisma.timeOff.findUnique({
      where: { id: timeOffId },
      include: {
        technician: {
          select: { organizationId: true },
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

    // Verify the request is pending
    if (timeOff.status !== 'PENDING') {
      throw new BadRequestException('Time-off request has already been processed');
    }

    const updated = await this.prisma.timeOff.update({
      where: { id: timeOffId },
      data: {
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

    // Can only cancel pending requests
    if (timeOff.status !== 'PENDING') {
      throw new BadRequestException('Can only cancel pending time-off requests');
    }

    const updated = await this.prisma.timeOff.update({
      where: { id: timeOffId },
      data: { status: 'CANCELED' },
    });

    return success(updated);
  }

  // ========================================================================
  // AVAILABILITY QUERIES
  // ========================================================================

  /**
   * Get availability for all technicians on a specific date or date range
   */
  async getAvailability(dto: GetAvailabilityDto) {
    const { organizationId, date, startDate, endDate } = dto;

    // Default to today if no date provided
    const queryDate = date ? new Date(date) : new Date();
    const dayOfWeek = queryDate.getDay();

    // Get all technicians in the organization
    const technicians = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: 'TECHNICIAN',
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        technicianType: true,
        workMode: true,
        schedules: {
          where: { dayOfWeek, isActive: true },
        },
        timeOffRequests: {
          where: {
            status: 'APPROVED',
            startDate: { lte: queryDate },
            endDate: { gte: queryDate },
          },
        },
      },
    });

    const availability = technicians.map((tech) => {
      const schedule = tech.schedules[0] || null;
      const onTimeOff = tech.timeOffRequests.length > 0;
      const hasSchedule = schedule !== null;

      return {
        id: tech.id,
        firstName: tech.firstName,
        lastName: tech.lastName,
        technicianType: tech.technicianType,
        workMode: tech.workMode,
        isAvailable: hasSchedule && !onTimeOff,
        onTimeOff,
        schedule: schedule
          ? {
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              notes: schedule.notes,
            }
          : null,
        timeOff: tech.timeOffRequests[0]
          ? {
              startDate: tech.timeOffRequests[0].startDate,
              endDate: tech.timeOffRequests[0].endDate,
              reason: tech.timeOffRequests[0].reason,
            }
          : null,
      };
    });

    return success({
      date: queryDate.toISOString().split('T')[0],
      dayOfWeek,
      dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
      technicians: availability,
      summary: {
        total: technicians.length,
        available: availability.filter((a) => a.isAvailable).length,
        onTimeOff: availability.filter((a) => a.onTimeOff).length,
        notScheduled: availability.filter((a) => !a.schedule).length,
      },
    });
  }
}
