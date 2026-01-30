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
  TechnicianType,
  TimeEntryStatus,
  BreakType,
  ApprovalStatus,
  haversineDistance,
  ATTENDANCE_CONSTANTS,
  SERVICE_NAMES,
  buildDateRangeFilter,
  buildSingleDayFilter,
  getStartOfDay,
  getEndOfDay,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
  formatDuration,
} from '@doergo/shared';
import { format } from 'date-fns';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Clock in at a company location
   */
  async clockIn(data: {
    userId: string;
    locationId: string;
    lat: number;
    lng: number;
    accuracy?: number;
    organizationId: string;
  }) {
    this.logger.log(`Clock in attempt: user=${data.userId}, location=${data.locationId}`);

    // Verify user is a FULL_TIME technician
    const user = await this.prisma.user.findFirst({
      where: {
        id: data.userId,
        organizationId: data.organizationId,
        role: 'TECHNICIAN',
      },
    });

    if (!user) {
      throw new NotFoundException('Technician not found');
    }

    if (user.technicianType !== TechnicianType.FULL_TIME) {
      throw new BadRequestException(
        'Only FULL_TIME technicians can use attendance clock-in',
      );
    }

    // Verify user has an active assignment to this location
    const assignment = await this.prisma.technicianAssignment.findFirst({
      where: {
        userId: data.userId,
        locationId: data.locationId,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
    });

    if (!assignment) {
      throw new BadRequestException(
        'You are not assigned to this location. Contact your administrator.',
      );
    }

    // Check if already clocked in
    const existingEntry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        location: true,
      },
    });

    if (existingEntry) {
      throw new BadRequestException(
        `You are already clocked in at ${existingEntry.location.name}. Please clock out first.`,
      );
    }

    // Get location details
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.locationId,
        organizationId: data.organizationId,
        isActive: true,
      },
    });

    if (!location) {
      throw new NotFoundException('Location not found or inactive');
    }

    // Check GPS accuracy
    if (
      data.accuracy &&
      data.accuracy > ATTENDANCE_CONSTANTS.GPS_ACCURACY_THRESHOLD
    ) {
      throw new BadRequestException(
        `GPS accuracy too low (${Math.round(data.accuracy)}m). Please wait for better signal. Required: ${ATTENDANCE_CONSTANTS.GPS_ACCURACY_THRESHOLD}m or better.`,
      );
    }

    // Calculate distance to location
    const distance = haversineDistance(
      data.lat,
      data.lng,
      location.lat,
      location.lng,
    );

    const withinGeofence = distance <= location.geofenceRadius;

    // Reject if not within geofence (if required)
    if (ATTENDANCE_CONSTANTS.REQUIRE_GEOFENCE_FOR_CLOCK_IN && !withinGeofence) {
      throw new BadRequestException(
        `You must be within ${location.geofenceRadius}m of ${location.name} to clock in. Current distance: ${Math.round(distance)}m`,
      );
    }

    // Create time entry
    const entry = await this.prisma.timeEntry.create({
      data: {
        userId: data.userId,
        locationId: data.locationId,
        status: TimeEntryStatus.CLOCKED_IN,
        clockInAt: new Date(),
        clockInLat: data.lat,
        clockInLng: data.lng,
        clockInAccuracy: data.accuracy,
        clockInWithinGeofence: withinGeofence,
        organizationId: data.organizationId,
      },
      include: {
        location: true,
      },
    });

    this.logger.log(
      `Clock in successful: entry=${entry.id}, user=${data.userId}, location=${location.name}, withinGeofence=${withinGeofence}`,
    );

    return success(entry, `Clocked in at ${location.name}`);
  }

  /**
   * Clock out from current shift
   */
  async clockOut(data: {
    userId: string;
    lat: number;
    lng: number;
    accuracy?: number;
    notes?: string;
    organizationId: string;
  }) {
    this.logger.log(`Clock out attempt: user=${data.userId}`);

    // Find active clock-in entry
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        location: true,
      },
    });

    if (!entry) {
      throw new BadRequestException('You are not currently clocked in');
    }

    // Calculate distance to location for clock-out
    const distance = haversineDistance(
      data.lat,
      data.lng,
      entry.location.lat,
      entry.location.lng,
    );

    const withinGeofence = distance <= entry.location.geofenceRadius;

    // Calculate total minutes worked
    const clockOutTime = new Date();
    const totalMinutes = Math.round(
      (clockOutTime.getTime() - entry.clockInAt.getTime()) / (1000 * 60),
    );

    // Update time entry
    const updatedEntry = await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutAt: clockOutTime,
        clockOutLat: data.lat,
        clockOutLng: data.lng,
        clockOutAccuracy: data.accuracy,
        clockOutWithinGeofence: withinGeofence,
        totalMinutes,
        notes: data.notes,
      },
      include: {
        location: true,
      },
    });

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    this.logger.log(
      `Clock out successful: entry=${entry.id}, user=${data.userId}, duration=${hours}h ${minutes}m`,
    );

    // Send geofence alert if clock-out is outside geofence
    if (!withinGeofence && ATTENDANCE_CONSTANTS.ALERT_ON_GEOFENCE_VIOLATION) {
      await this.sendGeofenceAlert({
        userId: data.userId,
        organizationId: data.organizationId,
        locationName: entry.location.name,
        distance: Math.round(distance),
        allowedRadius: entry.location.geofenceRadius,
        action: 'clock_out',
      });
    }

    return success(
      updatedEntry,
      `Clocked out from ${entry.location.name}. Total time: ${hours}h ${minutes}m`,
    );
  }

  /**
   * Get current attendance status for a technician
   */
  async getStatus(data: { userId: string; organizationId: string }) {
    // Get current clock-in entry if any
    const currentEntry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        location: true,
      },
    });

    // Get assigned locations
    const assignments = await this.prisma.technicianAssignment.findMany({
      where: {
        userId: data.userId,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      include: {
        location: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const assignedLocations = assignments.map((a) => a.location);

    return success({
      isClockedIn: !!currentEntry,
      currentEntry,
      assignedLocations,
    });
  }

  /**
   * Get attendance history for a technician
   */
  async getHistory(data: {
    userId: string;
    organizationId: string;
    startDate?: Date | string;
    endDate?: Date | string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      userId: data.userId,
      organizationId: data.organizationId,
    };

    // Date range filter
    if (data.startDate || data.endDate) {
      where.clockInAt = {};
      if (data.startDate) {
        where.clockInAt.gte = new Date(data.startDate);
      }
      if (data.endDate) {
        where.clockInAt.lte = new Date(data.endDate);
      }
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          location: true,
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Get time entries for a location (admin view)
   */
  async getLocationEntries(data: {
    locationId: string;
    organizationId: string;
    date?: Date | string;
    page?: number;
    limit?: number;
  }) {
    // Verify location belongs to organization
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.locationId,
        organizationId: data.organizationId,
      },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const page = data.page ?? 1;
    const limit = data.limit ?? 50;
    const skip = (page - 1) * limit;

    // Default to today if no date provided
    const targetDate = data.date || new Date().toISOString();

    const where = {
      locationId: data.locationId,
      clockInAt: buildSingleDayFilter(targetDate),
    };

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Auto clock-out for entries that exceeded max duration
   * @param type - 'hourly' checks only overdue entries, 'midnight' closes all open entries
   */
  async autoClockOut(data?: { type?: 'hourly' | 'midnight'; manual?: boolean }) {
    const type = data?.type ?? 'hourly';
    const isManual = data?.manual ?? false;

    this.logger.log(`Auto clock-out triggered: type=${type}, manual=${isManual}`);

    if (type === 'midnight') {
      return this.midnightClockOut();
    }

    return this.hourlyClockOut();
  }

  /**
   * Hourly check: Clock out entries that exceeded max duration
   */
  private async hourlyClockOut() {
    const maxDurationMs =
      ATTENDANCE_CONSTANTS.MAX_CLOCK_IN_DURATION_HOURS * 60 * 60 * 1000;
    const cutoffTime = new Date(Date.now() - maxDurationMs);

    const overdueEntries = await this.prisma.timeEntry.findMany({
      where: {
        status: TimeEntryStatus.CLOCKED_IN,
        clockInAt: { lt: cutoffTime },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        location: { select: { name: true } },
      },
    });

    if (overdueEntries.length === 0) {
      this.logger.debug('Hourly auto clock-out: No overdue entries found');
      return success({
        type: 'hourly',
        processedCount: 0,
        entryIds: [],
        message: 'No overdue entries found',
      });
    }

    const results = [];
    const now = new Date();

    for (const entry of overdueEntries) {
      const totalMinutes = Math.round(
        (now.getTime() - entry.clockInAt.getTime()) / (1000 * 60),
      );
      const totalHours = totalMinutes / 60;

      await this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          status: TimeEntryStatus.AUTO_OUT,
          clockOutAt: now,
          totalMinutes,
          notes: `Auto clock-out: exceeded ${ATTENDANCE_CONSTANTS.MAX_CLOCK_IN_DURATION_HOURS} hour limit`,
        },
      });

      results.push(entry.id);

      // Emit notification event
      this.notificationClient.emit('attendance_auto_clock_out', {
        userId: entry.user.id,
        userEmail: entry.user.email,
        userName: `${entry.user.firstName} ${entry.user.lastName}`,
        locationName: entry.location.name,
        clockInTime: format(entry.clockInAt, 'MMM d, yyyy h:mm a'),
        clockOutTime: format(now, 'MMM d, yyyy h:mm a'),
        totalHours,
        reason: 'exceeded_duration',
        organizationId: entry.organizationId,
      });

      this.logger.warn(
        `Auto clock-out (overdue): entry=${entry.id}, user=${entry.user.firstName} ${entry.user.lastName}, location=${entry.location.name}, duration=${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
      );
    }

    return success({
      type: 'hourly',
      processedCount: results.length,
      entryIds: results,
      message: `Processed ${results.length} overdue entries`,
    });
  }

  /**
   * Get all time entries for an organization (admin view)
   */
  async getAllEntries(data: {
    organizationId: string;
    date?: Date | string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: data.organizationId,
    };

    // Date filter
    if (data.date) {
      where.clockInAt = buildSingleDayFilter(data.date);
    }

    // Status filter
    if (data.status) {
      where.status = data.status;
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Midnight check: Clock out ALL remaining open entries
   */
  private async midnightClockOut() {
    const openEntries = await this.prisma.timeEntry.findMany({
      where: {
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        location: { select: { name: true } },
      },
    });

    if (openEntries.length === 0) {
      this.logger.debug('Midnight auto clock-out: No open entries found');
      return success({
        type: 'midnight',
        processedCount: 0,
        entryIds: [],
        message: 'No open entries found',
      });
    }

    const results = [];
    const now = new Date();

    for (const entry of openEntries) {
      const totalMinutes = Math.round(
        (now.getTime() - entry.clockInAt.getTime()) / (1000 * 60),
      );
      const totalHours = totalMinutes / 60;

      await this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          status: TimeEntryStatus.AUTO_OUT,
          clockOutAt: now,
          totalMinutes,
          notes: 'Auto clock-out: end of day',
        },
      });

      results.push(entry.id);

      // Emit notification event
      this.notificationClient.emit('attendance_auto_clock_out', {
        userId: entry.user.id,
        userEmail: entry.user.email,
        userName: `${entry.user.firstName} ${entry.user.lastName}`,
        locationName: entry.location.name,
        clockInTime: format(entry.clockInAt, 'MMM d, yyyy h:mm a'),
        clockOutTime: format(now, 'MMM d, yyyy h:mm a'),
        totalHours,
        reason: 'end_of_day',
        organizationId: entry.organizationId,
      });

      this.logger.warn(
        `Auto clock-out (midnight): entry=${entry.id}, user=${entry.user.firstName} ${entry.user.lastName}, location=${entry.location.name}, duration=${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
      );
    }

    this.logger.log(`Midnight auto clock-out complete: ${results.length} entries processed`);

    return success({
      type: 'midnight',
      processedCount: results.length,
      entryIds: results,
      message: `End of day: closed ${results.length} open entries`,
    });
  }

  // =========================================================================
  // ATTENDANCE REPORTS
  // =========================================================================

  /**
   * Get attendance summary for a period
   */
  async getAttendanceSummary(data: {
    organizationId: string;
    userId?: string;
    startDate: Date | string;
    endDate: Date | string;
  }) {
    const dateFilter = buildDateRangeFilter(data.startDate, data.endDate);

    const where: any = {
      organizationId: data.organizationId,
      clockInAt: dateFilter,
    };

    if (data.userId) {
      where.userId = data.userId;
    }

    const entries = await this.prisma.timeEntry.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { clockInAt: 'asc' },
    });

    // Calculate summary statistics
    const totalMinutes = entries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0);
    const totalShifts = entries.filter((e) => e.status !== 'CLOCKED_IN').length;
    const activeShifts = entries.filter((e) => e.status === 'CLOCKED_IN').length;
    const autoClockOuts = entries.filter((e) => e.status === 'AUTO_OUT').length;

    // Standard hours calculation (8 hours per day for workdays in period)
    const workDays = this.countWorkDays(new Date(data.startDate), new Date(data.endDate));
    const standardHours = workDays * 8;
    const actualHours = totalMinutes / 60;
    const overtimeHours = Math.max(0, actualHours - standardHours);

    // Group by user for per-employee stats
    const byUser: Record<string, any> = {};
    for (const entry of entries) {
      const userId = entry.user.id;
      if (!byUser[userId]) {
        byUser[userId] = {
          user: entry.user,
          totalMinutes: 0,
          shifts: 0,
          autoClockOuts: 0,
          locations: new Set<string>(),
        };
      }
      byUser[userId].totalMinutes += entry.totalMinutes || 0;
      if (entry.status !== 'CLOCKED_IN') byUser[userId].shifts++;
      if (entry.status === 'AUTO_OUT') byUser[userId].autoClockOuts++;
      byUser[userId].locations.add(entry.location.name);
    }

    const userSummaries = Object.values(byUser).map((u: any) => ({
      user: u.user,
      totalHours: Math.round((u.totalMinutes / 60) * 10) / 10,
      shifts: u.shifts,
      autoClockOuts: u.autoClockOuts,
      locations: Array.from(u.locations),
      averageShiftHours:
        u.shifts > 0 ? Math.round((u.totalMinutes / u.shifts / 60) * 10) / 10 : 0,
    }));

    // Group by location
    const byLocation: Record<string, any> = {};
    for (const entry of entries) {
      const locId = entry.location.id;
      if (!byLocation[locId]) {
        byLocation[locId] = {
          location: entry.location,
          totalMinutes: 0,
          shifts: 0,
          uniqueUsers: new Set<string>(),
        };
      }
      byLocation[locId].totalMinutes += entry.totalMinutes || 0;
      if (entry.status !== 'CLOCKED_IN') byLocation[locId].shifts++;
      byLocation[locId].uniqueUsers.add(entry.userId);
    }

    const locationSummaries = Object.values(byLocation).map((l: any) => ({
      location: l.location,
      totalHours: Math.round((l.totalMinutes / 60) * 10) / 10,
      shifts: l.shifts,
      uniqueTechnicians: l.uniqueUsers.size,
    }));

    return success({
      period: {
        startDate: format(new Date(data.startDate), 'yyyy-MM-dd'),
        endDate: format(new Date(data.endDate), 'yyyy-MM-dd'),
        workDays,
      },
      summary: {
        totalHours: Math.round(actualHours * 10) / 10,
        totalShifts,
        activeShifts,
        autoClockOuts,
        standardHours,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        averageShiftHours:
          totalShifts > 0 ? Math.round((totalMinutes / totalShifts / 60) * 10) / 10 : 0,
      },
      byUser: userSummaries,
      byLocation: locationSummaries,
    });
  }

  /**
   * Get weekly attendance report
   */
  async getWeeklyReport(data: {
    organizationId: string;
    userId?: string;
    weekStartDate?: Date | string;
  }) {
    // Use shared utilities for week calculation
    const baseDate = data.weekStartDate ? new Date(data.weekStartDate) : new Date();
    const startDate = getStartOfWeek(baseDate);
    const endDate = getEndOfWeek(baseDate);

    return this.getAttendanceSummary({
      organizationId: data.organizationId,
      userId: data.userId,
      startDate,
      endDate,
    });
  }

  /**
   * Get monthly attendance report
   */
  async getMonthlyReport(data: {
    organizationId: string;
    userId?: string;
    year?: number;
    month?: number; // 1-12
  }) {
    const now = new Date();
    const year = data.year ?? now.getFullYear();
    const month = data.month ?? now.getMonth() + 1;

    // Create base date for the target month
    const baseDate = new Date(year, month - 1, 15); // Mid-month to avoid edge cases
    const startDate = getStartOfMonth(baseDate);
    const endDate = getEndOfMonth(baseDate);

    return this.getAttendanceSummary({
      organizationId: data.organizationId,
      userId: data.userId,
      startDate,
      endDate,
    });
  }

  /**
   * Export attendance data to CSV format
   */
  async exportToCSV(data: {
    organizationId: string;
    startDate: Date | string;
    endDate: Date | string;
    userId?: string;
  }) {
    const dateFilter = buildDateRangeFilter(data.startDate, data.endDate);

    const where: any = {
      organizationId: data.organizationId,
      clockInAt: dateFilter,
    };

    if (data.userId) {
      where.userId = data.userId;
    }

    const entries = await this.prisma.timeEntry.findMany({
      where,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        location: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ clockInAt: 'asc' }],
    });

    // Build CSV
    const headers = [
      'Date',
      'Technician',
      'Email',
      'Location',
      'Clock In',
      'Clock Out',
      'Status',
      'Duration (Hours)',
      'Within Geofence (In)',
      'Within Geofence (Out)',
      'Notes',
    ];

    const rows = entries.map((entry) => [
      format(entry.clockInAt, 'yyyy-MM-dd'),
      `${entry.user.firstName} ${entry.user.lastName}`,
      entry.user.email,
      entry.location.name,
      format(entry.clockInAt, 'HH:mm:ss'),
      entry.clockOutAt ? format(entry.clockOutAt, 'HH:mm:ss') : '',
      entry.status,
      entry.totalMinutes ? (entry.totalMinutes / 60).toFixed(2) : '',
      entry.clockInWithinGeofence ? 'Yes' : 'No',
      entry.clockOutWithinGeofence === null ? '' : entry.clockOutWithinGeofence ? 'Yes' : 'No',
      entry.notes || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n');

    return success({
      filename: `attendance_${format(new Date(data.startDate), 'yyyy-MM-dd')}_to_${format(new Date(data.endDate), 'yyyy-MM-dd')}.csv`,
      content: csvContent,
      mimeType: 'text/csv',
      recordCount: entries.length,
    });
  }

  /**
   * Count work days (Monday-Friday) in a date range
   */
  private countWorkDays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  // =========================================================================
  // BREAK TRACKING
  // =========================================================================

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

  // =========================================================================
  // APPROVAL WORKFLOW
  // =========================================================================

  /**
   * Get entries pending approval
   */
  async getPendingApprovals(data: {
    organizationId: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: data.organizationId,
      approvalStatus: ApprovalStatus.PENDING,
      status: { not: 'CLOCKED_IN' as any }, // Only completed entries
    };

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          location: {
            select: { id: true, name: true },
          },
          breaks: true,
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Approve a time entry
   */
  async approveEntry(data: {
    entryId: string;
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException(
        `Entry is already ${entry.approvalStatus.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.notes,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        location: {
          select: { name: true },
        },
      },
    });

    this.logger.log(
      `Entry approved: entry=${data.entryId}, approver=${data.approverId}`,
    );

    return success(updated, 'Time entry approved');
  }

  /**
   * Reject a time entry
   */
  async rejectEntry(data: {
    entryId: string;
    approverId: string;
    organizationId: string;
    reason: string;
  }) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException(
        `Entry is already ${entry.approvalStatus.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.reason,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(
      `Entry rejected: entry=${data.entryId}, approver=${data.approverId}, reason=${data.reason}`,
    );

    return success(updated, 'Time entry rejected');
  }

  /**
   * Edit a time entry (manager correction)
   */
  async editEntry(data: {
    entryId: string;
    editorId: string;
    organizationId: string;
    clockInAt?: string;
    clockOutAt?: string;
    notes?: string;
    reason: string;
  }) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('Edit reason is required');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    const updateData: any = {
      isEdited: true,
      editedById: data.editorId,
      editedAt: new Date(),
      editReason: data.reason,
    };

    // Save original values on first edit
    if (!entry.isEdited) {
      updateData.originalClockIn = entry.clockInAt;
      updateData.originalClockOut = entry.clockOutAt;
    }

    if (data.clockInAt) {
      updateData.clockInAt = new Date(data.clockInAt);
    }

    if (data.clockOutAt) {
      updateData.clockOutAt = new Date(data.clockOutAt);
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    // Recalculate total minutes if times changed
    const newClockIn = updateData.clockInAt || entry.clockInAt;
    const newClockOut = updateData.clockOutAt || entry.clockOutAt;

    if (newClockOut) {
      updateData.totalMinutes = Math.round(
        (new Date(newClockOut).getTime() - new Date(newClockIn).getTime()) /
          (1000 * 60),
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: updateData,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        location: {
          select: { name: true },
        },
        editedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(
      `Entry edited: entry=${data.entryId}, editor=${data.editorId}, reason=${data.reason}`,
    );

    return success(updated, 'Time entry updated');
  }

  /**
   * Bulk approve entries
   */
  async bulkApprove(data: {
    entryIds: string[];
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const results = {
      approved: [] as string[],
      failed: [] as { id: string; reason: string }[],
    };

    for (const entryId of data.entryIds) {
      try {
        await this.approveEntry({
          entryId,
          approverId: data.approverId,
          organizationId: data.organizationId,
          notes: data.notes,
        });
        results.approved.push(entryId);
      } catch (error: any) {
        results.failed.push({ id: entryId, reason: error.message });
      }
    }

    return success(results, `Approved ${results.approved.length} entries`);
  }

  // =========================================================================
  // GEOFENCE ALERTS
  // =========================================================================

  /**
   * Send geofence violation alert to dispatchers and admins
   */
  private async sendGeofenceAlert(data: {
    userId: string;
    organizationId: string;
    locationName: string;
    distance: number;
    allowedRadius: number;
    action: 'clock_in' | 'clock_out';
  }) {
    try {
      // Get user info
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { firstName: true, lastName: true, email: true },
      });

      if (!user) return;

      // Get dispatchers and admins for the organization
      const managers = await this.prisma.user.findMany({
        where: {
          organizationId: data.organizationId,
          role: { in: ['ADMIN', 'DISPATCHER'] },
          isActive: true,
        },
        select: { email: true },
      });

      const dispatcherEmails = managers.map((m) => m.email);
      // Device tokens for push notifications (to be implemented when push is set up)
      const dispatcherDeviceTokens: string[] = [];

      // Emit notification event
      this.notificationClient.emit('attendance_geofence_alert', {
        userId: data.userId,
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        locationName: data.locationName,
        distance: data.distance,
        allowedRadius: data.allowedRadius,
        action: data.action,
        dispatcherEmails,
        dispatcherDeviceTokens,
        organizationId: data.organizationId,
      });

      this.logger.warn(
        `Geofence alert sent: user=${user.firstName} ${user.lastName}, action=${data.action}, distance=${data.distance}m, allowed=${data.allowedRadius}m`,
      );
    } catch (error) {
      this.logger.error('Failed to send geofence alert', error);
    }
  }
}
