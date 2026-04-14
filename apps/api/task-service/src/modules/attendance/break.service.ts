import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  paginated,
  TimeEntryStatus,
  SERVICE_NAMES,
  buildDateRangeFilter,
  buildSingleDayFilter,
} from '@hbcfield/shared';

@Injectable()
export class BreakService {
  private readonly logger = new Logger(BreakService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Start a break during current shift
   */
  async startBreak(data: {
    userId: string;
    organizationId: string;
    type?: string;
    notes?: string;
  }) {
    this.logger.log(`Start break: user=${data.userId}, type=${data.type || 'SHORT'}`);

    // Find active clock-in entry
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        breaks: {
          where: { endedAt: null },
        },
      },
    });

    if (!entry) {
      throw new BadRequestException('You must be clocked in to take a break');
    }

    // Check if already on break
    if (entry.breaks && entry.breaks.length > 0) {
      throw new BadRequestException('You are already on a break. End your current break first.');
    }

    // Create break record
    const breakRecord = await this.prisma.break.create({
      data: {
        timeEntryId: entry.id,
        type: (data.type as any) || 'SHORT',
        startedAt: new Date(),
        notes: data.notes,
      },
    });

    // Get user info for notification
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { firstName: true, lastName: true },
    });

    // Emit break started notification
    this.notificationClient.emit('break_started', {
      userId: data.userId,
      userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
      breakId: breakRecord.id,
      breakType: breakRecord.type,
      startedAt: breakRecord.startedAt.toISOString(),
      organizationId: data.organizationId,
    });

    this.logger.log(`Break started: break=${breakRecord.id}, entry=${entry.id}`);

    return success(breakRecord, 'Break started');
  }

  /**
   * End current break
   */
  async endBreak(data: {
    userId: string;
    organizationId: string;
    notes?: string;
  }) {
    this.logger.log(`End break: user=${data.userId}`);

    // Find active clock-in entry with active break
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        breaks: {
          where: { endedAt: null },
        },
      },
    });

    if (!entry) {
      throw new BadRequestException('You must be clocked in to end a break');
    }

    if (!entry.breaks || entry.breaks.length === 0) {
      throw new BadRequestException('You are not currently on a break');
    }

    const activeBreak = entry.breaks[0];
    const now = new Date();
    const durationMinutes = Math.round(
      (now.getTime() - activeBreak.startedAt.getTime()) / (1000 * 60),
    );

    // Update break record
    const updatedBreak = await this.prisma.break.update({
      where: { id: activeBreak.id },
      data: {
        endedAt: now,
        durationMinutes,
        notes: data.notes || activeBreak.notes,
      },
    });

    // Update total break minutes on time entry
    const allBreaks = await this.prisma.break.findMany({
      where: {
        timeEntryId: entry.id,
        endedAt: { not: null },
      },
    });

    const totalBreakMinutes = allBreaks.reduce(
      (sum, b) => sum + (b.durationMinutes || 0),
      0,
    );

    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: { breakMinutes: totalBreakMinutes },
    });

    // Get user info for notification
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { firstName: true, lastName: true },
    });

    // Emit break ended notification
    this.notificationClient.emit('break_ended', {
      userId: data.userId,
      userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
      breakId: updatedBreak.id,
      breakType: updatedBreak.type,
      startedAt: activeBreak.startedAt.toISOString(),
      endedAt: now.toISOString(),
      durationMinutes,
      organizationId: data.organizationId,
    });

    this.logger.log(
      `Break ended: break=${updatedBreak.id}, duration=${durationMinutes}min, totalBreakMinutes=${totalBreakMinutes}`,
    );

    return success(updatedBreak, `Break ended (${durationMinutes} minutes)`);
  }

  /**
   * Get current break status
   */
  async getBreakStatus(data: { userId: string; organizationId: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        breaks: {
          orderBy: { startedAt: 'desc' },
        },
      },
    });

    if (!entry) {
      return success({
        isClockedIn: false,
        isOnBreak: false,
        currentBreak: null,
        todayBreaks: [],
        totalBreakMinutes: 0,
      });
    }

    const activeBreak = entry.breaks.find((b) => !b.endedAt);
    const completedBreaks = entry.breaks.filter((b) => b.endedAt);
    const totalBreakMinutes = completedBreaks.reduce(
      (sum, b) => sum + (b.durationMinutes || 0),
      0,
    );

    return success({
      isClockedIn: true,
      isOnBreak: !!activeBreak,
      currentBreak: activeBreak || null,
      todayBreaks: entry.breaks,
      totalBreakMinutes,
    });
  }

  /**
   * Get breaks for a time entry
   */
  async getBreaksForEntry(data: { timeEntryId: string; organizationId: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.timeEntryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    const breaks = await this.prisma.break.findMany({
      where: { timeEntryId: data.timeEntryId },
      orderBy: { startedAt: 'asc' },
    });

    const totalMinutes = breaks.reduce(
      (sum, b) => sum + (b.durationMinutes || 0),
      0,
    );

    return success({
      breaks,
      totalBreakMinutes: totalMinutes,
      breakCount: breaks.length,
    });
  }

  /**
   * Get all active breaks in the organization (admin view)
   */
  async getActiveBreaks(data: { organizationId: string }) {
    const breaks = await this.prisma.break.findMany({
      where: {
        endedAt: null, // Active breaks
        timeEntry: {
          organizationId: data.organizationId,
        },
      },
      include: {
        timeEntry: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            location: true,
          },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    // Flatten the structure for easier consumption
    const flattenedBreaks = breaks.map((b) => ({
      ...b,
      user: b.timeEntry?.user,
      location: b.timeEntry?.location,
    }));

    return success(flattenedBreaks);
  }

  /**
   * Get break history with filters (admin view)
   */
  async getBreakHistory(data: {
    organizationId: string;
    date?: string;
    userId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page || 1;
    const limit = data.limit || 50;
    const skip = (page - 1) * limit;

    // Build date filter using shared utility
    const dateFilter = data.date
      ? { startedAt: buildSingleDayFilter(data.date) }
      : {};

    // Build where clause
    const where: any = {
      ...dateFilter,
      timeEntry: {
        organizationId: data.organizationId,
        ...(data.userId ? { userId: data.userId } : {}),
      },
      ...(data.type ? { type: data.type } : {}),
    };

    const [breaks, total] = await Promise.all([
      this.prisma.break.findMany({
        where,
        include: {
          timeEntry: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              location: true,
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.break.count({ where }),
    ]);

    // Flatten the structure
    const flattenedBreaks = breaks.map((b) => ({
      ...b,
      user: b.timeEntry?.user,
      location: b.timeEntry?.location,
    }));

    return paginated(flattenedBreaks, {
      total,
      page,
      limit,
    });
  }

  /**
   * End a break manually (admin action)
   */
  async endBreakManually(data: {
    breakId: string;
    adminId: string;
    organizationId: string;
    notes?: string;
  }) {
    const breakRecord = await this.prisma.break.findFirst({
      where: {
        id: data.breakId,
        endedAt: null, // Must be active
        timeEntry: {
          organizationId: data.organizationId,
        },
      },
      include: {
        timeEntry: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!breakRecord) {
      throw new NotFoundException('Active break not found');
    }

    const endedAt = new Date();
    const durationMinutes = Math.floor(
      (endedAt.getTime() - new Date(breakRecord.startedAt).getTime()) / 60000,
    );

    const updatedBreak = await this.prisma.break.update({
      where: { id: data.breakId },
      data: {
        endedAt,
        durationMinutes,
        notes: data.notes
          ? `[Admin ended] ${data.notes}`
          : `[Admin ended by ${data.adminId}]`,
      },
    });

    // Update time entry break minutes
    const totalBreakMinutes = await this.prisma.break.aggregate({
      where: {
        timeEntryId: breakRecord.timeEntryId,
        durationMinutes: { not: null },
      },
      _sum: {
        durationMinutes: true,
      },
    });

    await this.prisma.timeEntry.update({
      where: { id: breakRecord.timeEntryId },
      data: {
        breakMinutes: totalBreakMinutes._sum.durationMinutes || 0,
      },
    });

    this.logger.log(
      `Admin ${data.adminId} ended break ${data.breakId} for user ${breakRecord.timeEntry.user.firstName} ${breakRecord.timeEntry.user.lastName}`,
    );

    return success(updatedBreak, `Break ended by admin (${durationMinutes} minutes)`);
  }

  /**
   * Get break summary statistics for a date range
   */
  async getBreakSummary(data: {
    organizationId: string;
    startDate: string;
    endDate: string;
    userId?: string;
  }) {
    const dateFilter = buildDateRangeFilter(data.startDate, data.endDate);

    // Build where clause
    const where: any = {
      startedAt: dateFilter,
      timeEntry: {
        organizationId: data.organizationId,
        ...(data.userId ? { userId: data.userId } : {}),
      },
      durationMinutes: { not: null }, // Only completed breaks
    };

    // Get all breaks in the period
    const breaks = await this.prisma.break.findMany({
      where,
      select: {
        type: true,
        durationMinutes: true,
      },
    });

    // Calculate statistics
    const totalBreaks = breaks.length;
    const totalBreakMinutes = breaks.reduce(
      (sum, b) => sum + (b.durationMinutes || 0),
      0,
    );
    const averageBreakMinutes =
      totalBreaks > 0 ? Math.round(totalBreakMinutes / totalBreaks) : 0;

    // Group by type
    const breaksByType = {
      LUNCH: { count: 0, totalMinutes: 0 },
      SHORT: { count: 0, totalMinutes: 0 },
      OTHER: { count: 0, totalMinutes: 0 },
    };

    for (const b of breaks) {
      const type = b.type as 'LUNCH' | 'SHORT' | 'OTHER';
      if (breaksByType[type]) {
        breaksByType[type].count++;
        breaksByType[type].totalMinutes += b.durationMinutes || 0;
      }
    }

    // Calculate averages per type
    for (const type of Object.keys(breaksByType) as Array<'LUNCH' | 'SHORT' | 'OTHER'>) {
      if (breaksByType[type].count > 0) {
        (breaksByType[type] as any).averageMinutes = Math.round(
          breaksByType[type].totalMinutes / breaksByType[type].count,
        );
      } else {
        (breaksByType[type] as any).averageMinutes = 0;
      }
    }

    return success({
      period: {
        startDate: data.startDate,
        endDate: data.endDate,
      },
      totalBreaks,
      totalBreakMinutes,
      averageBreakMinutes,
      breaksByType,
    });
  }
}
