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
  WorkMode,
  TimeEntryStatus,
  haversineDistance,
  ATTENDANCE_CONSTANTS,
  SERVICE_NAMES,
  buildSingleDayFilter,
} from '@hbcfield/shared';
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

    // Verify user is a technician with on-site work mode
    const user = await this.prisma.user.findFirst({
      where: {
        id: data.userId,
        organizationId: data.organizationId,
        role: 'TECHNICIAN',
      },
      select: {
        id: true,
        workMode: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Technician not found');
    }

    if (user.workMode === WorkMode.ON_ROAD) {
      throw new BadRequestException(
        'ON_ROAD technicians cannot use attendance clock-in. Change work mode to ON_SITE or HYBRID.',
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

    // Reject if not within geofence (if strict mode enabled)
    if (ATTENDANCE_CONSTANTS.REQUIRE_GEOFENCE_FOR_CLOCK_IN && !withinGeofence) {
      throw new BadRequestException(
        `You must be within ${location.geofenceRadius}m of ${location.name} to clock in. Current distance: ${Math.round(distance)}m`,
      );
    }

    // Smart auto-approval: evaluate clock-in against schedule
    const clockInTime = new Date();
    const flagReasons: string[] = [];

    // Check geofence
    if (!withinGeofence) {
      flagReasons.push('OUTSIDE_GEOFENCE_IN');
    }

    // Look up today's schedule
    const dayOfWeek = clockInTime.getDay();
    const schedule = await this.prisma.technicianSchedule.findFirst({
      where: { technicianId: data.userId, dayOfWeek, isActive: true },
    });

    if (!schedule) {
      flagReasons.push('UNSCHEDULED_DAY');
    } else {
      // Check for late arrival
      const [schedH, schedM] = schedule.startTime.split(':').map(Number);
      const scheduledStart = new Date(clockInTime);
      scheduledStart.setHours(schedH!, schedM!, 0, 0);
      const lateMinutes = (clockInTime.getTime() - scheduledStart.getTime()) / 60000;
      if (lateMinutes > ATTENDANCE_CONSTANTS.LATE_ARRIVAL_THRESHOLD_MINUTES) {
        flagReasons.push('LATE_ARRIVAL');
      }
    }

    const approvalStatus = flagReasons.length === 0 ? 'AUTO' : 'PENDING';

    // Create time entry
    const entry = await this.prisma.timeEntry.create({
      data: {
        userId: data.userId,
        locationId: data.locationId,
        status: TimeEntryStatus.CLOCKED_IN,
        clockInAt: clockInTime,
        clockInLat: data.lat,
        clockInLng: data.lng,
        clockInAccuracy: data.accuracy,
        clockInWithinGeofence: withinGeofence,
        flagReasons,
        approvalStatus,
        organizationId: data.organizationId,
      },
      include: {
        location: true,
      },
    });

    this.logger.log(
      `Clock in successful: entry=${entry.id}, user=${data.userId}, location=${location.name}, withinGeofence=${withinGeofence}, flags=[${flagReasons.join(',')}], approval=${approvalStatus}`,
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

    // Smart auto-approval: evaluate clock-out against schedule
    const flagReasons: string[] = [...(entry.flagReasons || [])];

    // Check geofence on clock-out
    if (!withinGeofence) {
      flagReasons.push('OUTSIDE_GEOFENCE_OUT');
    }

    // Look up today's schedule for overtime/early departure
    const dayOfWeek = clockOutTime.getDay();
    const schedule = await this.prisma.technicianSchedule.findFirst({
      where: { technicianId: data.userId, dayOfWeek, isActive: true },
    });

    if (schedule) {
      const [endH, endM] = schedule.endTime.split(':').map(Number);
      const scheduledEnd = new Date(clockOutTime);
      scheduledEnd.setHours(endH!, endM!, 0, 0);
      const diffMinutes = (clockOutTime.getTime() - scheduledEnd.getTime()) / 60000;

      if (diffMinutes > ATTENDANCE_CONSTANTS.OVERTIME_THRESHOLD_MINUTES) {
        flagReasons.push('OVERTIME');
      }
      if (diffMinutes < -ATTENDANCE_CONSTANTS.EARLY_DEPARTURE_THRESHOLD_MINUTES) {
        flagReasons.push('EARLY_DEPARTURE');
      }
    }

    // Deduplicate flags
    const uniqueFlags = [...new Set(flagReasons)];
    const approvalStatus = uniqueFlags.length === 0 ? 'AUTO' : 'PENDING';

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
        flagReasons: uniqueFlags,
        approvalStatus,
      },
      include: {
        location: true,
      },
    });

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    this.logger.log(
      `Clock out successful: entry=${entry.id}, user=${data.userId}, duration=${hours}h ${minutes}m, flags=[${uniqueFlags.join(',')}], approval=${approvalStatus}`,
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
   * Process location heartbeat while clocked in.
   * Checks geofence distance and auto-clocks out if too far.
   */
  async heartbeat(data: {
    userId: string;
    lat: number;
    lng: number;
    accuracy?: number;
    organizationId: string;
  }) {
    this.logger.log(`Heartbeat from user ${data.userId} at ${data.lat},${data.lng}`);

    // Find active clock-in entry
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: { location: true },
    });

    if (!entry || !entry.location) {
      return success({ withinGeofence: true, distance: 0, autoClockedOut: false }, 'No active entry');
    }

    const distance = haversineDistance(data.lat, data.lng, entry.location.lat, entry.location.lng);
    const withinGeofence = distance <= entry.location.geofenceRadius;
    const autoClockOutDistance = ATTENDANCE_CONSTANTS.AUTO_CLOCK_OUT_DISTANCE_METERS;

    // Auto clock-out if beyond the maximum distance
    if (distance >= autoClockOutDistance) {
      this.logger.warn(
        `User ${data.userId} is ${Math.round(distance)}m from location (limit: ${autoClockOutDistance}m). Auto-clocking out.`,
      );

      await this.clockOut({
        userId: data.userId,
        lat: data.lat,
        lng: data.lng,
        accuracy: data.accuracy,
        organizationId: data.organizationId,
        notes: `Auto clock-out: ${Math.round(distance)}m from work area (limit: ${autoClockOutDistance}m)`,
      });

      // Send push notification
      this.notificationClient.emit('push_notification', {
        userId: data.userId,
        title: 'Auto Clock-Out',
        body: `You were automatically clocked out because you are ${Math.round(distance)}m away from your work location.`,
        data: { type: 'attendance.auto_clock_out', distance: Math.round(distance) },
      });

      return success(
        { withinGeofence: false, distance: Math.round(distance), autoClockedOut: true },
        'Auto-clocked out due to distance',
      );
    }

    // Send warning push notification if outside geofence but within auto-clock-out range
    if (!withinGeofence) {
      this.notificationClient.emit('push_notification', {
        userId: data.userId,
        title: 'Geofence Warning',
        body: `You are ${Math.round(distance)}m from your work area. Please return or clock out.`,
        data: { type: 'attendance.geofence_warning', distance: Math.round(distance) },
      });
    }

    return success(
      { withinGeofence, distance: Math.round(distance), autoClockedOut: false },
      withinGeofence ? 'Within geofence' : 'Outside geofence',
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

      const existingFlags = (entry as any).flagReasons || [];
      const mergedFlags = [...new Set([...existingFlags, 'MISSED_CLOCK_OUT'])];

      await this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          status: TimeEntryStatus.AUTO_OUT,
          clockOutAt: now,
          totalMinutes,
          notes: `Auto clock-out: exceeded ${ATTENDANCE_CONSTANTS.MAX_CLOCK_IN_DURATION_HOURS} hour limit`,
          flagReasons: mergedFlags,
          approvalStatus: 'PENDING',
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

      const existingFlags = (entry as any).flagReasons || [];
      const mergedFlags = [...new Set([...existingFlags, 'MISSED_CLOCK_OUT'])];

      await this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          status: TimeEntryStatus.AUTO_OUT,
          clockOutAt: now,
          totalMinutes,
          notes: 'Auto clock-out: end of day',
          flagReasons: mergedFlags,
          approvalStatus: 'PENDING',
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
  // Report methods → AttendanceReportService
  // Break methods → BreakService
  // Approval methods → ApprovalService
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
        select: { id: true, email: true },
      });

      const dispatcherEmails = managers.map((m) => m.email);
      const dispatcherIds = managers.map((m) => m.id);

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
        dispatcherIds,
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
