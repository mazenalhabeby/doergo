import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  paginated,
  TimeEntryStatus,
  haversineDistance,
  ATTENDANCE_CONSTANTS,
  SERVICE_NAMES,
  QUEUE_NAMES,
  OVERTIME_JOB_TYPES,
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
    @InjectQueue(QUEUE_NAMES.OVERTIME)
    private readonly overtimeQueue: Queue,
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
        role: 'EMPLOYEE',
      },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Employee not found');
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

    // Emit real-time event for dashboard/team updates
    this.notificationClient.emit('attendance_clock_in', {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: entry,
    });

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

    // Emit real-time event for dashboard/team updates
    this.notificationClient.emit('attendance_clock_out', {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: updatedEntry,
    });

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
    requesterId?: string;
    requesterCanViewAll?: boolean;
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

    // Authorization: full-access roles see any location; otherwise the requester
    // must be a roster member of this location (employees viewing their own space).
    if (!data.requesterCanViewAll) {
      const member = await this.prisma.technicianAssignment.findFirst({
        where: { locationId: data.locationId, userId: data.requesterId },
        select: { id: true },
      });
      if (!member) {
        throw new ForbiddenException('Not a member of this space');
      }
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
   * Today's entries for MANY locations in 2 queries (vs 4-per-location) — backs
   * the dashboard. Full-access roles get all requested org spaces; otherwise the
   * set is narrowed to the spaces the requester is a roster member of.
   */
  async getLocationEntriesBatch(data: {
    locationIds: string[];
    organizationId: string;
    date?: Date | string;
    requesterId?: string;
    requesterCanViewAll?: boolean;
  }) {
    const ids = (data.locationIds || []).filter(Boolean);
    if (!ids.length) return success([]);

    const locs = await this.prisma.companyLocation.findMany({
      where: { id: { in: ids }, organizationId: data.organizationId },
      select: { id: true },
    });
    let validIds = locs.map((l) => l.id);

    if (!data.requesterCanViewAll && validIds.length) {
      const memberships = await this.prisma.technicianAssignment.findMany({
        where: { userId: data.requesterId, locationId: { in: validIds } },
        select: { locationId: true },
      });
      const allowed = new Set(memberships.map((m) => m.locationId));
      validIds = validIds.filter((id) => allowed.has(id));
    }
    if (!validIds.length) return success([]);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        locationId: { in: validIds },
        clockInAt: buildSingleDayFilter(data.date || new Date().toISOString()),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { clockInAt: 'desc' },
      take: 500,
    });
    return success(entries);
  }

  /**
   * Auto clock-out for entries that exceeded max duration
   * @param type - 'hourly' checks only overdue entries, 'midnight' closes all open entries
   */
  async autoClockOut(data?: { type?: 'hourly' | 'midnight'; manual?: boolean }) {
    const isManual = data?.manual ?? false;
    this.logger.log(`Auto clock-out triggered: manual=${isManual}`);

    // Find all open entries with their location timezone and user schedule
    const openEntries = await this.prisma.timeEntry.findMany({
      where: { status: TimeEntryStatus.CLOCKED_IN },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        location: { select: { name: true, timezone: true } },
      },
    });

    if (openEntries.length === 0) {
      this.logger.debug('Auto clock-out: No open entries found');
      return success({ processedCount: 0, entryIds: [], reasons: {} });
    }

    const results: string[] = [];
    const reasons: Record<string, string> = {};
    const now = new Date();
    const maxDurationMs = ATTENDANCE_CONSTANTS.MAX_CLOCK_IN_DURATION_HOURS * 60 * 60 * 1000;

    // Batch the per-entry lookups up front to avoid an N+1 over open shifts:
    // one query for all overtime requests, one for all active schedules.
    const entryIds = openEntries.map((e) => e.id);
    const userIds = [...new Set(openEntries.map((e) => e.userId))];

    const overtimeRequests = await this.prisma.overtimeRequest.findMany({
      where: { timeEntryId: { in: entryIds } },
    });
    const overtimeByEntry = new Map(overtimeRequests.map((o) => [o.timeEntryId, o]));

    const activeSchedules = await this.prisma.technicianSchedule.findMany({
      where: { technicianId: { in: userIds }, isActive: true },
    });
    const scheduleByUserDay = new Map(
      activeSchedules.map((s) => [`${s.technicianId}:${s.dayOfWeek}`, s]),
    );

    for (const entry of openEntries) {
      // Skip entries that are in the overtime flow (pending, approved, or waiting approval)
      const activeOvertimeRequest = overtimeByEntry.get(entry.id);
      if (activeOvertimeRequest && ['PENDING_TECHNICIAN', 'PENDING_APPROVAL', 'APPROVED'].includes(activeOvertimeRequest.status)) {
        this.logger.debug(`Skipping entry ${entry.id}: active overtime request (${activeOvertimeRequest.status})`);
        continue;
      }

      const tz = entry.location?.timezone || 'UTC';
      let reason: string | null = null;

      // 1. Check max duration (16h) — universal, no timezone needed
      const durationMs = now.getTime() - entry.clockInAt.getTime();
      if (durationMs > maxDurationMs) {
        reason = 'exceeded_duration';
      }

      // 2. Check if it's past midnight in the LOCATION's timezone
      if (!reason) {
        const localTime = this.getLocalTime(now, tz);
        const clockInLocal = this.getLocalTime(entry.clockInAt, tz);
        // If the local date has changed since clock-in, it's past midnight
        if (localTime.date !== clockInLocal.date) {
          reason = 'end_of_day';
        }
      }

      // 3. Check if shift has ended (schedule-based) with grace period
      //    Instead of immediate clock-out, initiate overtime request flow
      if (!reason) {
        const schedule = scheduleByUserDay.get(
          `${entry.userId}:${this.getLocalDayOfWeek(entry.clockInAt, tz)}`,
        );

        if (schedule?.endTime) {
          const localNow = this.getLocalTime(now, tz);
          const [endH, endM] = schedule.endTime.split(':').map(Number);
          const endMinutes = endH! * 60 + endM!;
          const nowMinutes = localNow.hours * 60 + localNow.minutes;
          const gracePeriod = ATTENDANCE_CONSTANTS.SCHEDULE_GRACE_PERIOD_MINUTES;

          if (nowMinutes >= endMinutes + gracePeriod) {
            // Check if overtime request already exists (from the batched map)
            const existingOT = overtimeByEntry.get(entry.id);
            if (!existingOT) {
              // Initiate overtime flow instead of clock-out
              await this.overtimeQueue.add(OVERTIME_JOB_TYPES.INITIATE, {
                userId: entry.userId,
                timeEntryId: entry.id,
                locationId: entry.locationId,
                organizationId: entry.organizationId,
              }, { removeOnComplete: true });
              this.logger.log(`Shift ended for entry ${entry.id}: initiated overtime flow instead of auto-clock-out`);
            }
            // Skip clock-out — overtime timeout checker handles it
            continue;
          }
        }
      }

      if (!reason) continue;

      // Auto clock-out this entry
      const totalMinutes = Math.round(durationMs / (1000 * 60));
      const totalHours = totalMinutes / 60;
      const existingFlags = (entry as any).flagReasons || [];
      const mergedFlags = [...new Set([...existingFlags, 'MISSED_CLOCK_OUT'])];

      const reasonNotes: Record<string, string> = {
        exceeded_duration: `Auto clock-out: exceeded ${ATTENDANCE_CONSTANTS.MAX_CLOCK_IN_DURATION_HOURS}h limit`,
        end_of_day: `Auto clock-out: end of day (midnight in ${tz})`,
        shift_ended: `Auto clock-out: shift ended + ${ATTENDANCE_CONSTANTS.SCHEDULE_GRACE_PERIOD_MINUTES}min grace period`,
      };

      await this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          status: TimeEntryStatus.AUTO_OUT,
          clockOutAt: now,
          totalMinutes,
          notes: reasonNotes[reason] || 'Auto clock-out',
          flagReasons: mergedFlags,
          approvalStatus: 'PENDING',
        },
      });

      results.push(entry.id);
      reasons[entry.id] = reason;

      this.notificationClient.emit('attendance_auto_clock_out', {
        userId: entry.user.id,
        userEmail: entry.user.email,
        userName: `${entry.user.firstName} ${entry.user.lastName}`,
        locationName: entry.location?.name || 'Unknown',
        clockInTime: format(entry.clockInAt, 'MMM d, yyyy h:mm a'),
        clockOutTime: format(now, 'MMM d, yyyy h:mm a'),
        totalHours,
        reason,
        organizationId: entry.organizationId,
      });

      this.logger.warn(
        `Auto clock-out (${reason}): entry=${entry.id}, user=${entry.user.firstName} ${entry.user.lastName}, tz=${tz}, duration=${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
      );
    }

    return success({
      processedCount: results.length,
      entryIds: results,
      reasons,
      message: `Processed ${results.length} entries`,
    });
  }

  /**
   * Get local time components in a specific timezone
   */
  private getLocalTime(date: Date, timezone: string): { hours: number; minutes: number; date: string } {
    try {
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      };
      const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
      const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
      return {
        hours: parseInt(get('hour')),
        minutes: parseInt(get('minute')),
        date: `${get('year')}-${get('month')}-${get('day')}`,
      };
    } catch {
      // Fallback to UTC if timezone is invalid
      return {
        hours: date.getUTCHours(),
        minutes: date.getUTCMinutes(),
        date: date.toISOString().split('T')[0]!,
      };
    }
  }

  /**
   * Get day of week (0=Sunday) in a specific timezone
   */
  private getLocalDayOfWeek(date: Date, timezone: string): number {
    try {
      const options: Intl.DateTimeFormatOptions = { timeZone: timezone, weekday: 'short' };
      const dayStr = new Intl.DateTimeFormat('en-US', options).format(date);
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return dayMap[dayStr] ?? date.getUTCDay();
    } catch {
      return date.getUTCDay();
    }
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

  // midnightClockOut removed — replaced by timezone-aware autoClockOut that runs every 15 min

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
          role: { in: ['ADMIN', 'MANAGER'] },
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
