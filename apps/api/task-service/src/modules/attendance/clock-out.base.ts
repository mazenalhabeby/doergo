import { Injectable } from '@nestjs/common';
import { personName, zoneOf } from '@hbcfield/shared';
import { ShiftCloseBase } from './shift-close.base';

/** The entry the alerts speak about — what the clock-out read before closing it. */
interface AlertEntry {
  id: string;
  userId: string;
  organizationId: string;
  locationId: string;
  timezone: string | null;
  expectedClockOutAt: Date | null;
}

/** What the close saved, for the names in the alerts. */
interface ClosedFacts {
  user: { firstName: string | null; lastName: string | null } | null;
  location: { name: string; timezone: string | null } | null;
}

/** Who is told what when a shift ends. */
@Injectable()
export abstract class ClockOutAlertsBase extends ShiftCloseBase {
  /**
   * The supervisors were told "still clocked in past the end of the shift".
   * The clock-out has now arrived — usually from a phone that had no signal,
   * with the time it was actually tapped. Say so, to the same people.
   */
  protected async announceEscalationResolved(
    entry: AlertEntry,
    closed: ClosedFacts,
    clockOutTime: Date,
    recordedOffline: boolean,
  ) {
    const leaderIds = await this.routing.notifyTargetsFor(entry, 'canReconcileAttendance');
    this.notificationClient.emit('attendance_shift_escalation_resolved', {
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
  protected async announceLeftEarly(entry: AlertEntry, closed: ClosedFacts, shortBy: number, earlyReason: string) {
    const leaderIds = await this.routing.notifyTargetsFor(entry, 'canReconcileAttendance');
    this.notificationClient.emit('attendance_left_early', {
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
  protected async sendGeofenceAlert(data: {
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
      this.notificationClient.emit('attendance_geofence_alert', {
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
