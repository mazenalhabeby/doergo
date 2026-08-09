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
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { ShiftResolverService, ResolverSpace } from './shift-resolver.service';

// tz-lookup: offline coords → IANA timezone (single in-memory lookup, no types pkg).
const tzlookup: (lat: number, lon: number) => string = require('tz-lookup');
import {
  success,
  paginated,
  TimeEntryStatus,
  haversineDistance,
  ATTENDANCE_CONSTANTS,
  SHIFT_REMINDER_DEFAULTS,
  UNSCHEDULED_SESSION_DEFAULTS,
  SERVICE_NAMES,
  QUEUE_NAMES,
  buildSingleDayFilter,
  buildDateRangeFilter,
} from '@hbcfield/shared';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    @InjectQueue(QUEUE_NAMES.OVERTIME)
    private readonly overtimeQueue: Queue,
    private readonly notificationRouting: NotificationRoutingService,
    private readonly shiftResolver: ShiftResolverService,
  ) {}

  /**
   * Resolve the shift expectation for a clock-in and return the DB fields to
   * stamp on the TimeEntry. Returns {} for spaces without hour expectations
   * (workModel NONE/TASK) or when no shift/schedule matches — leaving the entry
   * with the default reminderState=NONE and no expected end. Never throws:
   * a resolver failure must not block a clock-in.
   */
  /**
   * Resolve the IANA timezone WHERE the worker physically clocked in, from the
   * clock-in GPS. Computed once here (offline, microsecond lookup) and stored on
   * the entry so display is a zero-cost read — and correct for remote clock-ins.
   * Falls back to the space's timezone when GPS is unavailable/invalid.
   */
  private resolveEntryTimezone(lat: number | null | undefined, lng: number | null | undefined, spaceTz?: string | null): string | null {
    // (0,0) is Null Island — a missing/failed GPS fix, not a real location.
    if (lat != null && lng != null && !(lat === 0 && lng === 0)) {
      try {
        return tzlookup(lat, lng);
      } catch {
        // out-of-range / lookup miss → fall through to the space timezone
      }
    }
    return spaceTz ?? null;
  }

  private async buildShiftStamp(
    userId: string,
    space: ResolverSpace,
    clockInAt: Date,
  ): Promise<{ shiftId?: string; expectedClockOutAt?: Date; nextRemindAt?: Date }> {
    try {
      const resolved = await this.shiftResolver.resolveForClockIn({ userId, space, clockInAt });
      if (!resolved) return this.unscheduledStamp(clockInAt);
      return {
        ...(resolved.shiftId ? { shiftId: resolved.shiftId } : {}),
        expectedClockOutAt: resolved.expectedClockOutAt,
        nextRemindAt: resolved.nextRemindAt,
      };
    } catch (err) {
      this.logger.error(`Shift resolution failed for user=${userId} space=${space.id}: ${err}`);
      // Even on resolver failure, arm the safety-net so the session can't run silently forever.
      return this.unscheduledStamp(clockInAt);
    }
  }

  /**
   * Safety-net stamp for a clock-in with NO resolved shift: leave shiftId /
   * expectedClockOutAt null (marks it "unscheduled") but arm nextRemindAt at
   * SOFT_HOURS so the reminder sweep picks it up and can't let it run to 71h.
   */
  private unscheduledStamp(clockInAt: Date): { nextRemindAt: Date } {
    return {
      nextRemindAt: new Date(clockInAt.getTime() + UNSCHEDULED_SESSION_DEFAULTS.SOFT_HOURS * 3_600_000),
    };
  }

  /**
   * Clock in at a company location
   */
  async clockIn(data: {
    userId: string;
    locationId?: string;
    lat: number;
    lng: number;
    accuracy?: number;
    organizationId: string;
    isRemote?: boolean;
  }) {
    this.logger.log(`Clock in attempt: user=${data.userId}, location=${data.locationId}, remote=${!!data.isRemote}`);

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
        allowRemote: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Employee not found');
    }

    // ---- Remote clock-in (WFH/anywhere): geofence-exempt, coarse place captured ----
    if (data.isRemote) {
      if (!user.allowRemote) {
        throw new BadRequestException(
          'You are not permitted to clock in remotely. Ask your administrator to enable remote clock-in for your account.',
        );
      }
      const already = await this.prisma.timeEntry.findFirst({
        where: { userId: data.userId, status: TimeEntryStatus.CLOCKED_IN },
        include: { location: true },
      });
      if (already) {
        throw new BadRequestException(
          `You are already clocked in${already.location ? ` at ${already.location.name}` : ''}. Please clock out first.`,
        );
      }
      const bucket = await this.getOrCreateRemoteBucket(data.organizationId);
      const place = await this.reverseGeocode(data.lat, data.lng);
      const remoteClockInAt = new Date();
      const remoteStamp = await this.buildShiftStamp(data.userId, bucket, remoteClockInAt);
      const entry = await this.prisma.timeEntry.create({
        data: {
          userId: data.userId,
          locationId: bucket.id,
          status: TimeEntryStatus.CLOCKED_IN,
          clockInAt: remoteClockInAt,
          clockInLat: data.lat,
          clockInLng: data.lng,
          clockInAccuracy: data.accuracy,
          clockInWithinGeofence: true,
          isRemote: true,
          clockInPlace: place,
          timezone: this.resolveEntryTimezone(data.lat, data.lng, bucket.timezone),
          flagReasons: [],
          approvalStatus: 'AUTO',
          organizationId: data.organizationId,
          ...remoteStamp,
        },
        include: { location: true, user: { select: { firstName: true, lastName: true } } },
      });
      this.logger.log(`Remote clock in: entry=${entry.id}, user=${data.userId}, place=${place ?? 'unknown'}`);
      this.notificationClient.emit('attendance_clock_in', {
        userId: data.userId,
        organizationId: data.organizationId,
        timeEntry: entry,
      });
      return success(entry, place ? `Clocked in remotely · ${place}` : 'Clocked in remotely');
    }

    // ---- On-site clock-in requires a target location ----
    if (!data.locationId) {
      throw new BadRequestException('A location is required to clock in on site.');
    }

    // Verify user has an assignment to this location that is active RIGHT NOW —
    // started (effectiveFrom <= now) and not expired (effectiveTo null or future).
    // Without the effectiveFrom bound a future-dated assignment could clock in early (L3).
    const now = new Date();
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: {
        userId: data.userId,
        spaceId: data.locationId,
        effectiveFrom: { lte: now },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: now } },
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

    // Calculate distance to location (logical spaces have no coords → no geofence)
    const distance =
      location.lat == null || location.lng == null
        ? 0
        : haversineDistance(data.lat, data.lng, location.lat, location.lng);

    // Accuracy-aware: allow the GPS error margin so a plausible on-site fix
    // passes instead of being hard-rejected for a fuzzy reading.
    const withinGeofence = distance <= location.geofenceRadius + (data.accuracy ?? 0);

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

    // Resolve the shift expectation once, now, as an absolute instant.
    const shiftStamp = await this.buildShiftStamp(data.userId, location, clockInTime);

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
        timezone: this.resolveEntryTimezone(data.lat, data.lng, location.timezone),
        flagReasons,
        approvalStatus,
        organizationId: data.organizationId,
        ...shiftStamp,
      },
      include: {
        location: true,
        user: { select: { firstName: true, lastName: true } },
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

  /** Find or create the org's geofence-exempt "Remote" bucket location. */
  private async getOrCreateRemoteBucket(organizationId: string) {
    const existing = await this.prisma.companyLocation.findFirst({
      where: { organizationId, isRemote: true },
    });
    if (existing) return existing;
    return this.prisma.companyLocation.create({
      data: { name: 'Remote', organizationId, isRemote: true, isActive: true },
    });
  }

  /**
   * Coarse reverse-geocode (city-level) via OpenStreetMap Nominatim. Returns
   * e.g. "Vienna, AT", or null on failure. zoom=10 keeps it to city/area
   * granularity (never a precise street) for privacy.
   */
  private async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'HBCField/1.0 (attendance clock-in)' },
      });
      if (!res.ok) return null;
      const j: any = await res.json();
      const a = j?.address ?? {};
      const city = a.city || a.town || a.village || a.municipality || a.county || a.state;
      const country = (a.country_code || '').toUpperCase();
      if (!city) return null;
      return country ? `${city}, ${country}` : city;
    } catch {
      return null;
    }
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

    // Calculate distance to location for clock-out (no coords → no geofence)
    const distance =
      entry.location.lat == null || entry.location.lng == null
        ? 0
        : haversineDistance(data.lat, data.lng, entry.location.lat, entry.location.lng);

    // Accuracy-aware geofence (matches clock-in): tolerate the GPS error margin.
    const withinGeofence = distance <= entry.location.geofenceRadius + (data.accuracy ?? 0);

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

    // Overtime / early-departure flagging. Prefer the shift's stamped
    // `expectedClockOutAt` (an absolute UTC instant — timezone-correct and
    // cross-midnight-safe) when present; only fall back to the legacy weekly
    // technicianSchedule (server-local, same-day only) for non-shift spaces.
    if (entry.expectedClockOutAt) {
      const diffMinutes = (clockOutTime.getTime() - entry.expectedClockOutAt.getTime()) / 60000;
      if (diffMinutes > ATTENDANCE_CONSTANTS.OVERTIME_THRESHOLD_MINUTES) {
        flagReasons.push('OVERTIME');
      }
      if (diffMinutes < -ATTENDANCE_CONSTANTS.EARLY_DEPARTURE_THRESHOLD_MINUTES) {
        flagReasons.push('EARLY_DEPARTURE');
      }
    } else {
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
    }

    // Deduplicate flags
    const uniqueFlags = [...new Set(flagReasons)];
    const approvalStatus = uniqueFlags.length === 0 ? 'AUTO' : 'PENDING';

    // Remote shifts capture a coarse place on clock-out too.
    const clockOutPlace = entry.isRemote ? await this.reverseGeocode(data.lat, data.lng) : undefined;

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
        clockOutPlace,
        // Close out any shift-reminder lifecycle so a completed entry never
        // lingers in a reminder state and its nextRemindAt index key is cleared.
        reminderState: 'RESOLVED',
        nextRemindAt: null,
      },
      include: {
        location: true,
        user: { select: { firstName: true, lastName: true } },
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

    // Entry landed in the approvals queue → nudge managers (bell + push).
    if (approvalStatus === 'PENDING') {
      await this.sendPendingApprovalAlert({
        entryId: updatedEntry.id,
        userId: data.userId,
        organizationId: data.organizationId,
        locationName: entry.location.name,
        flagReasons: uniqueFlags,
        totalMinutes,
      });
    }

    return success(
      updatedEntry,
      `Clocked out from ${entry.location.name}. Total time: ${hours}h ${minutes}m`,
    );
  }

  // ==========================================================================
  // SHIFT REMINDER RESPONSES — worker actions + leader approval (Phase 3)
  // These are how an open shift gets resolved. Nothing here is auto-closed by
  // the machine; every path is driven by a human tapping a reminder action.
  // ==========================================================================

  /**
   * Worker responds "I forgot to clock out" with their real leave time
   * (trusted self-report). Closes the entry at that time. If the reported time
   * is beyond the expected shift end, the entry is flagged OVERTIME and lands in
   * the approvals queue for a leader to review — overtime is never paid silently.
   */
  async resolveForgotClockOut(data: {
    userId: string;
    entryId: string;
    clockOutAt: string;
    organizationId: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: { location: true },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');

    const clockOutTime = new Date(data.clockOutAt);
    const now = new Date();
    if (isNaN(clockOutTime.getTime())) throw new BadRequestException('Invalid clock-out time');
    if (clockOutTime.getTime() <= entry.clockInAt.getTime()) {
      throw new BadRequestException('Clock-out time must be after clock-in');
    }
    if (clockOutTime.getTime() > now.getTime() + 60_000) {
      throw new BadRequestException('Clock-out time cannot be in the future');
    }

    // Store GROSS minutes (clock-in → clock-out), consistent with the normal
    // clockOut path — break time lives separately on breakMinutes and is netted
    // out downstream, so we must not pre-subtract it here (that double-counted).
    const totalMinutes = Math.round((clockOutTime.getTime() - entry.clockInAt.getTime()) / 60_000);

    const flags = new Set<string>([...(entry.flagReasons || []), 'MISSED_CLOCK_OUT']);
    const isOvertime =
      !!entry.expectedClockOutAt && clockOutTime.getTime() > entry.expectedClockOutAt.getTime();
    if (isOvertime) flags.add('OVERTIME');
    const uniqueFlags = [...flags];

    const updated = await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutAt: clockOutTime,
        totalMinutes,
        notes: 'Self-reported clock-out (forgot to clock out)',
        flagReasons: uniqueFlags,
        approvalStatus: 'PENDING', // a forgotten clock-out is always worth a glance
        reminderState: 'RESOLVED',
        nextRemindAt: null,
      },
      include: { location: true, user: { select: { firstName: true, lastName: true } } },
    });

    this.notificationClient.emit('attendance_clock_out', {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: updated,
    });
    await this.sendPendingApprovalAlert({
      entryId: updated.id,
      userId: data.userId,
      organizationId: data.organizationId,
      locationName: entry.location?.name || 'Unknown',
      flagReasons: uniqueFlags,
      totalMinutes,
    });

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return success(
      updated,
      `Clocked out. Total time: ${h}h ${m}m${isOvertime ? ' (overtime pending approval)' : ''}`,
    );
  }

  /**
   * Worker responds "I'm working extra time". Pauses reminders and routes the
   * request to the space's overtime approvers. The entry stays open.
   */
  async requestExtraTime(data: { userId: string; entryId: string; organizationId: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        location: { select: { id: true, name: true, timezone: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');

    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: { reminderState: 'OVERTIME_PENDING', nextRemindAt: null },
    });

    const leaderIds = await this.resolveSpaceLeaders(
      entry.locationId,
      data.organizationId,
      'canApproveOvertime',
    );
    this.notificationClient.emit('attendance_overtime_request', {
      entryId: entry.id,
      userId: entry.userId,
      userName: `${entry.user.firstName} ${entry.user.lastName}`,
      locationId: entry.locationId,
      locationName: entry.location?.name || 'a shift',
      leaderIds,
      organizationId: data.organizationId,
    });

    return success({ entryId: entry.id, status: 'OVERTIME_PENDING' }, 'Extra-time request sent for approval');
  }

  /** Leader approves N more minutes of work → extends the expected end + re-arms reminders. */
  async approveExtraTime(data: {
    approverId: string;
    entryId: string;
    minutes: number;
    organizationId: string;
  }) {
    const minutes = Math.round(data.minutes);
    if (!minutes || minutes < 1 || minutes > 1440) {
      throw new BadRequestException('Approved minutes must be between 1 and 1440');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN },
      include: { shift: { select: { graceMin: true } } },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');

    const allowed = await this.userCanApproveOvertime(data.approverId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');

    const now = new Date();
    // Grant the extra minutes from the later of the expected end or now, so a
    // shift that already ended extends from now (not into the past).
    const base =
      entry.expectedClockOutAt && entry.expectedClockOutAt.getTime() > now.getTime()
        ? entry.expectedClockOutAt
        : now;
    const newExpected = new Date(base.getTime() + minutes * 60_000);
    const graceMin = entry.shift?.graceMin ?? SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;

    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        expectedClockOutAt: newExpected,
        reminderState: 'OVERTIME_APPROVED',
        reminderCount: 0,
        nextRemindAt: new Date(newExpected.getTime() + graceMin * 60_000),
      },
    });

    this.notificationClient.emit('attendance_overtime_decision', {
      entryId: entry.id,
      userId: entry.userId,
      decision: 'approved',
      minutes,
      newExpectedClockOutAt: newExpected.toISOString(),
      organizationId: data.organizationId,
    });

    return success(
      { entryId: entry.id, minutes, expectedClockOutAt: newExpected.toISOString() },
      `Approved ${minutes} min of overtime`,
    );
  }

  /** Leader rejects the extra-time request → nudge the worker to clock out now. */
  async rejectExtraTime(data: { approverId: string; entryId: string; organizationId: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN },
      select: { id: true, locationId: true, userId: true },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');

    const allowed = await this.userCanApproveOvertime(data.approverId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');

    // Give the worker a fresh reminder cycle to clock out now — reset the count
    // so a previously-exhausted worker gets a clean nudge, not instant escalation.
    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: { reminderState: 'REMINDED', reminderCount: 0, nextRemindAt: new Date() },
    });

    this.notificationClient.emit('attendance_overtime_decision', {
      entryId: entry.id,
      userId: entry.userId,
      decision: 'rejected',
      organizationId: data.organizationId,
    });

    return success({ entryId: entry.id, decision: 'rejected' }, 'Extra-time request rejected');
  }

  /** Open extra-time requests awaiting approval, scoped to spaces the caller can approve for. */
  async listPendingExtraTime(data: { userId: string; organizationId: string; isAdmin?: boolean }) {
    let spaceFilter: { locationId?: { in: string[] } } = {};
    if (!data.isAdmin) {
      const assignments = await this.prisma.spaceAssignment.findMany({
        where: { userId: data.userId, organizationId: data.organizationId, role: { isActive: true } },
        include: { role: { select: { permissions: true } } },
      });
      const spaceIds = assignments
        .filter((a) => (a.role?.permissions as any)?.canApproveOvertime === true)
        .map((a) => a.spaceId);
      if (spaceIds.length === 0) return success([], 'No pending extra-time requests');
      spaceFilter = { locationId: { in: spaceIds } };
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
        reminderState: 'OVERTIME_PENDING',
        ...spaceFilter,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        location: { select: { id: true, name: true, timezone: true } },
      },
      orderBy: { expectedClockOutAt: 'asc' },
    });
    return success(entries, `${entries.length} pending extra-time request(s)`);
  }

  /** True if the user may approve overtime for a space (space sub-role grant, or org admin). */
  private async userCanApproveOvertime(
    userId: string,
    spaceId: string,
    organizationId: string,
  ): Promise<boolean> {
    // Unified space assignment grant — spaceId is the resource's own, never
    // client-supplied, so this only grants where the user is truly assigned.
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: { userId, spaceId, organizationId, role: { isActive: true } },
      include: { role: { select: { permissions: true } } },
    });
    if ((assignment?.role?.permissions as any)?.canApproveOvertime === true) return true;
    // Org admins / user managers can always approve.
    const admin = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        isActive: true,
        OR: [{ role: 'ADMIN' }, { canManageUsers: true }],
      },
      select: { id: true },
    });
    return !!admin;
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
    this.logger.debug(`Heartbeat from user ${data.userId} at ${data.lat},${data.lng}`);

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

    const distance =
      entry.location.lat == null || entry.location.lng == null
        ? 0
        : haversineDistance(data.lat, data.lng, entry.location.lat, entry.location.lng);
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
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        userId: data.userId,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      include: {
        space: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const assignedLocations = assignments.map((a) => a.space);

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
    startDate?: Date | string;
    endDate?: Date | string;
    search?: string;
    page?: number;
    limit?: number;
    requesterId?: string;
    requesterCanViewAll?: boolean;
    sortBy?: string;
    sortOrder?: string;
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
      const member = await this.prisma.spaceAssignment.findFirst({
        where: { spaceId: data.locationId, userId: data.requesterId },
        select: { id: true },
      });
      if (!member) {
        throw new ForbiddenException('Not a member of this space');
      }
    }

    const page = data.page ?? 1;
    const limit = data.limit ?? 50;
    const skip = (page - 1) * limit;

    // A startDate/endDate range takes precedence; otherwise a single day
    // (defaulting to today when nothing is provided).
    const range = buildDateRangeFilter(data.startDate, data.endDate);
    const where: any = {
      locationId: data.locationId,
      clockInAt: range ?? buildSingleDayFilter(data.date || new Date().toISOString()),
    };

    // Name / email search
    if (data.search?.trim()) {
      const q = data.search.trim();
      where.user = {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
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
        },
        orderBy: this.buildEntriesOrderBy(data.sortBy, data.sortOrder),
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Who is clocked in RIGHT NOW, org-wide — answers the dashboard "on duty"
   * question independently of clock-in date. A shift that started before
   * midnight and is still open (overnight / long / forgot-to-clock-out) must
   * still count, so this filters on the open state (`status = CLOCKED_IN`),
   * NOT on a date window. Backed by the `[organizationId, status]` index and a
   * narrow select (only what the dashboard reads) → O(open entries), tiny
   * payload. No pagination: the open set is always small.
   */
  async getActiveEntries(data: { organizationId: string }) {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: data.organizationId,
        status: 'CLOCKED_IN',
      },
      select: {
        id: true,
        userId: true,
        locationId: true,
        clockInAt: true,
        clockOutAt: true,
        status: true,
        isRemote: true,
      },
      orderBy: { clockInAt: 'desc' },
    });
    return success(entries);
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
      const memberships = await this.prisma.spaceAssignment.findMany({
        where: { userId: data.requesterId, spaceId: { in: validIds } },
        select: { spaceId: true },
      });
      const allowed = new Set(memberships.map((m) => m.spaceId));
      validIds = validIds.filter((id) => allowed.has(id));
    }
    if (!validIds.length) return success([]);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        locationId: { in: validIds },
        // Today's entries PLUS any still-open shift (even one that started before
        // midnight) so overnight clock-ins stay "on duty" after the date rolls.
        OR: [
          { clockInAt: buildSingleDayFilter(data.date || new Date().toISOString()) },
          { status: 'CLOCKED_IN' },
        ],
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { clockInAt: 'desc' },
      take: 500,
    });
    return success(entries);
  }

  /**
   * Shift reminder engine — replaces the old force-close auto-clock-out.
   *
   * It NEVER clocks anyone out. On a short interval it scans only the open
   * shifts whose reminder is actually due (`nextRemindAt <= now`, served by the
   * `[status, nextRemindAt]` index — not every open shift) and either:
   *   • nudges the worker ("forgot to clock out, or working extra?") and re-arms
   *     the next reminder, or
   *   • after `maxReminders` with no response, escalates to a space leader
   *     (a member whose sub-role grants `canReconcileAttendance`) and stops.
   *
   * Entries with no expected end (`nextRemindAt` null — TASK/NONE spaces or an
   * unresolved shift) are never touched: no reminders and no auto-close.
   */
  async runShiftReminders(_data?: { manual?: boolean }) {
    const now = new Date();

    const dueEntries = await this.prisma.timeEntry.findMany({
      where: {
        status: TimeEntryStatus.CLOCKED_IN,
        nextRemindAt: { not: null, lte: now },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        location: { select: { id: true, name: true, timezone: true } },
        shift: { select: { reminderIntervalMin: true, maxReminders: true } },
      },
      orderBy: { nextRemindAt: 'asc' }, // drain oldest-due first
      take: 500, // cap per tick; any backlog drains over subsequent ticks
    });

    if (dueEntries.length === 0) {
      return success({ remindedCount: 0, escalatedCount: 0, entryIds: [] });
    }

    // Partition into reminders vs escalations up front.
    type Due = (typeof dueEntries)[number];
    const toRemind: { entry: Due; nextCount: number; intervalMin: number; maxReminders: number }[] = [];
    const toEscalate: Due[] = [];
    for (const entry of dueEntries) {
      // No expected end → this was an unscheduled clock-in armed by the safety net;
      // use the slower unscheduled cadence, not the tight shift cadence.
      const isUnscheduled = !entry.expectedClockOutAt;
      const intervalMin = isUnscheduled
        ? UNSCHEDULED_SESSION_DEFAULTS.REMINDER_INTERVAL_MINUTES
        : (entry.shift?.reminderIntervalMin ?? SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES);
      const maxReminders = isUnscheduled
        ? UNSCHEDULED_SESSION_DEFAULTS.MAX_REMINDERS
        : (entry.shift?.maxReminders ?? SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS);
      const nextCount = entry.reminderCount + 1;
      if (nextCount <= maxReminders) toRemind.push({ entry, nextCount, intervalMin, maxReminders });
      else toEscalate.push(entry);
    }

    // Resolve leaders ONCE per distinct escalating space (not per entry) — avoids
    // an N+1 + duplicate admin-fallback when many workers escalate together.
    const leadersBySpace = new Map<string, string[]>();
    await Promise.all(
      [...new Set(toEscalate.map((e) => e.locationId))].map(async (spaceId) => {
        const e = toEscalate.find((x) => x.locationId === spaceId)!;
        leadersBySpace.set(spaceId, await this.resolveSpaceLeaders(spaceId, e.organizationId, 'canReconcileAttendance'));
      }),
    );

    // Deferred writes (thunks) so we can cap DB concurrency.
    const tasks: Array<() => Promise<void>> = [];

    for (const { entry, nextCount, intervalMin, maxReminders } of toRemind) {
      const userName = `${entry.user.firstName} ${entry.user.lastName}`;
      const nextRemindAt = new Date(now.getTime() + intervalMin * 60_000);
      tasks.push(async () => {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: { reminderState: 'REMINDED', reminderCount: nextCount, nextRemindAt },
        });
        this.notificationClient.emit('attendance_shift_reminder', {
          entryId: entry.id,
          userId: entry.user.id,
          userName,
          locationId: entry.location?.id ?? entry.locationId,
          locationName: entry.location?.name || 'your shift',
          expectedClockOutAt: entry.expectedClockOutAt?.toISOString() ?? null,
          reminderCount: nextCount,
          unscheduled: !entry.expectedClockOutAt,
          hoursOpen: Math.round((now.getTime() - entry.clockInAt.getTime()) / 3_600_000),
          organizationId: entry.organizationId,
        });
        this.logger.log(`Shift reminder ${nextCount}/${maxReminders}: entry=${entry.id}, user=${userName}`);
      });
    }

    for (const entry of toEscalate) {
      const userName = `${entry.user.firstName} ${entry.user.lastName}`;
      const leaderIds = leadersBySpace.get(entry.locationId) ?? [];
      tasks.push(async () => {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: { reminderState: 'ESCALATED', nextRemindAt: null },
        });
        this.notificationClient.emit('attendance_shift_escalation', {
          entryId: entry.id,
          userId: entry.user.id,
          userName,
          locationId: entry.locationId,
          locationName: entry.location?.name || 'a shift',
          expectedClockOutAt: entry.expectedClockOutAt?.toISOString() ?? null,
          unscheduled: !entry.expectedClockOutAt,
          hoursOpen: Math.round((now.getTime() - entry.clockInAt.getTime()) / 3_600_000),
          leaderIds,
          organizationId: entry.organizationId,
        });
        this.logger.warn(`Shift escalation: entry=${entry.id}, user=${userName}, leaders=[${leaderIds.join(',')}]`);
      });
    }

    // Flush with bounded concurrency so a big burst can't monopolize the pooled
    // DB connections and starve live clock-in/out requests.
    const CONCURRENCY = 20;
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map((fn) => fn()));
    }

    return success({
      remindedCount: toRemind.length,
      escalatedCount: toEscalate.length,
      entryIds: [...toRemind.map((r) => r.entry.id), ...toEscalate.map((e) => e.id)],
      message: `Reminded ${toRemind.length}, escalated ${toEscalate.length}`,
    });
  }

  /**
   * Resolve who to notify for a space attendance action: members of the space
   * whose dynamic sub-role grants the given permission. Falls back to org admins
   * when the space has no such leaders configured, so escalations/approvals are
   * never silently dropped.
   */
  private async resolveSpaceLeaders(
    spaceId: string,
    organizationId: string,
    permission: 'canApproveOvertime' | 'canReconcileAttendance',
  ): Promise<string[]> {
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: { spaceId, organizationId, role: { isActive: true } },
      include: { role: { select: { permissions: true } } },
    });
    const leaderIds = assignments
      .filter((a) => (a.role?.permissions as any)?.[permission] === true)
      .map((a) => a.userId);
    if (leaderIds.length > 0) return [...new Set(leaderIds)];

    // Fallback: org admins / user managers.
    const admins = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [{ role: 'ADMIN' }, { canManageUsers: true }],
      },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }

  /**
   * Get all time entries for an organization (admin view)
   */
  /**
   * Map a UI sort key → Prisma orderBy for the entries list. Defaults to newest
   * clock-in first. `totalMinutes`/`clockOutAt` are nullable → nulls sort last.
   */
  private buildEntriesOrderBy(sortBy?: string, sortOrder?: string): any {
    const dir: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : 'desc';
    // Smart "sort by day": every non-chronological sort gets clock-in (newest day
    // first) as a secondary tie-breaker, so a worker's / status's rows always fall
    // into day order instead of an arbitrary within-group order. Invisible in the
    // UI — same columns, same rows — but the list is always day-coherent.
    const byDay = { clockInAt: 'desc' as const };
    switch (sortBy) {
      case 'worker':
        return [{ user: { firstName: dir } }, { user: { lastName: dir } }, byDay];
      case 'status':
        return [{ status: dir }, byDay];
      case 'clockIn':
        return { clockInAt: dir };
      case 'clockOut':
        return [{ clockOutAt: { sort: dir, nulls: 'last' } }, byDay];
      case 'duration':
        return [{ totalMinutes: { sort: dir, nulls: 'last' } }, byDay];
      case 'approval':
        return [{ approvalStatus: dir }, byDay];
      default:
        return byDay;
    }
  }

  async getAllEntries(data: {
    organizationId: string;
    date?: Date | string;
    startDate?: Date | string;
    endDate?: Date | string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: data.organizationId,
    };

    // Date filter — a startDate/endDate range takes precedence over a single day.
    const range = buildDateRangeFilter(data.startDate, data.endDate);
    if (range) {
      where.clockInAt = range;
    } else if (data.date) {
      where.clockInAt = buildSingleDayFilter(data.date);
    }

    // Status filter
    if (data.status) {
      where.status = data.status;
    }

    // Name / email search
    if (data.search?.trim()) {
      const q = data.search.trim();
      where.user = {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
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
              timezone: true,
            },
          },
        },
        orderBy: this.buildEntriesOrderBy(data.sortBy, data.sortOrder),
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

      // Route to the employee's watchers (per-employee override) or the admins +
      // managers of their space — not the whole org. See NotificationRoutingService.
      const { ids: dispatcherIds, emails: dispatcherEmails } =
        await this.notificationRouting.resolveWatchers(
          data.userId,
          data.organizationId,
          'attendance',
        );

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

  /**
   * Notify managers/admins that a time entry now needs approval (push + bell).
   * Fired when an entry transitions to approvalStatus = PENDING.
   */
  private async sendPendingApprovalAlert(data: {
    entryId: string;
    userId: string;
    organizationId: string;
    locationName: string;
    flagReasons: string[];
    totalMinutes: number;
  }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { firstName: true, lastName: true },
      });
      if (!user) return;

      const { ids: managerIds } = await this.notificationRouting.resolveWatchers(
        data.userId,
        data.organizationId,
        'attendance',
      );

      this.notificationClient.emit('attendance_pending_approval', {
        entryId: data.entryId,
        userId: data.userId,
        userName: `${user.firstName} ${user.lastName}`,
        locationName: data.locationName,
        flagReasons: data.flagReasons,
        totalMinutes: data.totalMinutes,
        managerIds,
        organizationId: data.organizationId,
      });

      this.logger.log(
        `Pending-approval alert sent: entry=${data.entryId}, user=${user.firstName} ${user.lastName}, flags=[${data.flagReasons.join(',')}]`,
      );
    } catch (error) {
      this.logger.error('Failed to send pending-approval alert', error);
    }
  }
}
