import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { personName, zoneOf, SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { AttendanceRoutingService } from './attendance-routing.service';
import {
  emitEvent,
  attendanceGeofenceAlertEvent,
  attendanceLeftEarlyEvent,
  attendanceShiftEscalationResolvedEvent,
} from '@hbcfield/shared/microservices';

/** The entry the alerts speak about — what the clock-out read before closing it. */
export interface AlertEntry {
  id: string;
  userId: string;
  organizationId: string;
  locationId: string;
  timezone: string | null;
  expectedClockOutAt: Date | null;
}

/** What the close saved, for the names in the alerts. */
export interface ClosedFacts {
  user: { firstName: string | null; lastName: string | null } | null;
  location: { name: string; timezone: string | null } | null;
}

/** Who is told what when a shift ends. A collaborator of ClockOutService, not a layer of it. */
@Injectable()
export class ClockOutAlertsService {
  // Named after the clock-out, whose log lines these always were.
  private readonly logger = new Logger('ClockOutService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly notificationRouting: NotificationRoutingService,
    // Who is told about this member, at this workspace.
    private readonly routing: AttendanceRoutingService,
  ) {}

  /**
   * The supervisors were told "still clocked in past the end of the shift".
   * The clock-out has now arrived — usually from a phone that had no signal,
   * with the time it was actually tapped. Say so, to the same people.
   */
  async announceEscalationResolved(
    entry: AlertEntry,
    closed: ClosedFacts,
    clockOutTime: Date,
    recordedOffline: boolean,
  ) {
    const leaderIds = await this.routing.notifyTargetsFor(entry, 'canReconcileAttendance');
    emitEvent(this.notificationClient, attendanceShiftEscalationResolvedEvent, {
      entryId: entry.id,
      userId: entry.userId,
      userName: personName(closed.user),
      clockOutAt: clockOutTime.toISOString(),
      timezone: zoneOf(entry.timezone, closed.location?.timezone),
      recordedOffline,
      leaderIds,
      organizationId: entry.organizationId,
    });
  }

  /**
   * Somebody has to know.
   *
   * The entry was already FLAGGED for this and landed in an approval queue —
   * which nobody watches in the moment. A shift ending ninety minutes early
   * is operational news: the site is a person short right now, and finding
   * out at the end of the month is finding out too late.
   */
  async announceLeftEarly(entry: AlertEntry, closed: ClosedFacts, shortBy: number, earlyReason: string) {
    const leaderIds = await this.routing.notifyTargetsFor(entry, 'canReconcileAttendance');
    emitEvent(this.notificationClient, attendanceLeftEarlyEvent, {
      entryId: entry.id,
      userId: entry.userId,
      userName: personName(closed.user),
      locationId: entry.locationId,
      locationName: closed.location?.name ?? 'a shift',
      shortfallMinutes: shortBy,
      expectedClockOutAt: entry.expectedClockOutAt?.toISOString() ?? null,
      reason: earlyReason || null,
      leaderIds,
      organizationId: entry.organizationId,
    });
  }

  /**
   * Send geofence violation alert to dispatchers and admins
   */
  async sendGeofenceAlert(data: {
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
      const { ids: dispatcherIds, emails: dispatcherEmails } = await this.notificationRouting.resolveWatchers(
        data.userId,
        data.organizationId,
        'attendance',
      );

      // Emit notification event
      emitEvent(this.notificationClient, attendanceGeofenceAlertEvent, {
        userId: data.userId,
        userName: personName(user),
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
        `Geofence alert sent: user=${user.firstName} ${user.lastName}, action=${data.action}, ` +
          `distance=${data.distance}m, allowed=${data.allowedRadius}m`,
      );
    } catch (error) {
      this.logger.error('Failed to send geofence alert', error);
    }
  }
}
