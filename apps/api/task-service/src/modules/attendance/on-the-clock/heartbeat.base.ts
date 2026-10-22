import { OPEN_EXCURSION_STATUSES } from '../core/open-shift-close';
import { Injectable, Inject, NotFoundException, Logger, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, personNameAndEmail } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { personName, GEOFENCE_EXCURSION, SERVICE_NAMES } from '@hbcfield/shared';
import { scopeAllows, type AttendanceScope } from '@hbcfield/shared';
import {
  emitEvent,
  geofenceExcursionOutEvent,
  geofenceExcursionRequestedEvent,
  geofenceExcursionApprovedEvent,
  geofenceExcursionRejectedEvent,
  geofenceExcursionReturnedEvent,
  geofenceExcursionExpiredEvent,
} from '@hbcfield/shared/microservices';

/** The six excursion events share one payload; the callers name the event. */
const EXCURSION_EVENTS = {
  geofence_excursion_out: geofenceExcursionOutEvent,
  geofence_excursion_requested: geofenceExcursionRequestedEvent,
  geofence_excursion_approved: geofenceExcursionApprovedEvent,
  geofence_excursion_rejected: geofenceExcursionRejectedEvent,
  geofence_excursion_returned: geofenceExcursionReturnedEvent,
  geofence_excursion_expired: geofenceExcursionExpiredEvent,
} as const;
import { PresenceService } from '../presence/presence.service';
import { ClockOutService } from '../clock-out/clock-out.service';
import { RestAwayService } from '../rests/rest-away.service';

/**
 * What the presence services share: a member's open away-from-site excursion, its
 * length, finding one in the organization, and announcing a change.
 */
@Injectable()
export abstract class HeartbeatBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    protected readonly notificationClient: ClientProxy,
    protected readonly notificationRouting: NotificationRoutingService,
    // Where they are working now — display only, and never in the way of a clock-in.
    protected readonly presence: PresenceService,
    protected readonly clockOuts: ClockOutService,
    // Lunch off site is the rest (rest-away.service); optional so a bare test construction still runs.
    @Optional() protected readonly restAway?: RestAwayService,
  ) {}

  /** Latest active excursion for a session (OUT_UNREPORTED / PENDING / APPROVED). */
  async getActiveExcursion(timeEntryId: string) {
    return this.prisma.geofenceExcursion.findFirst({
      where: { timeEntryId, status: { in: [...OPEN_EXCURSION_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  protected clampExcursionMinutes(minutes: number): number {
    const n = Math.round(Number(minutes));
    if (!Number.isFinite(n) || n <= 0) return GEOFENCE_EXCURSION.DURATION_PRESETS[0];
    return Math.min(n, GEOFENCE_EXCURSION.CUSTOM_MAX_MINUTES);
  }

  protected async loadOrgExcursion(excursionId: string, organizationId: string, scope?: AttendanceScope) {
    const excursion = await this.prisma.geofenceExcursion.findUnique({ where: { id: excursionId } });
    // An excursion names the space whose ring was left, so the check is direct.
    if (!excursion || excursion.organizationId !== organizationId || !scopeAllows(scope, excursion.spaceId)) {
      throw new NotFoundException('Out-of-ring request not found');
    }
    return excursion;
  }

  /**
   * Resolve recipients and emit an excursion event. "responsible" events route
   * through resolveWatchers (same set as geofence/pending-approval alerts);
   * employee-facing events go to the employee. Also fires a push.
   */
  protected async emitExcursionEvent(
    event:
      | 'geofence_excursion_out'
      | 'geofence_excursion_requested'
      | 'geofence_excursion_approved'
      | 'geofence_excursion_rejected'
      | 'geofence_excursion_returned'
      | 'geofence_excursion_expired',
    entry: { userId: string; organizationId: string; locationId: string; location?: { name?: string } | null },
    excursion: {
      id: string;
      status: string;
      reason?: string | null;
      requestedMinutes?: number | null;
      grantedMinutes?: number | null;
      expiresAt?: Date | null;
    },
    ctx: { distanceM?: number },
  ) {
    try {
      const user = await personNameAndEmail(this.prisma, entry.userId);
      const userName = user ? personName(user) : 'A worker';
      const spaceName = entry.location?.name ?? 'the work area';

      // Responsible-facing events fan out to the employee's watchers.
      const toResponsible =
        event === 'geofence_excursion_requested' ||
        event === 'geofence_excursion_returned' ||
        event === 'geofence_excursion_expired';
      let watcherIds: string[] = [];
      let watcherEmails: string[] = [];
      if (toResponsible) {
        const w = await this.notificationRouting.resolveWatchers(entry.userId, entry.organizationId, 'attendance');
        watcherIds = w.ids;
        watcherEmails = w.emails;
      }

      emitEvent(this.notificationClient, EXCURSION_EVENTS[event], {
        excursionId: excursion.id,
        status: excursion.status,
        userId: entry.userId,
        userName,
        userEmail: user?.email,
        spaceId: entry.locationId,
        spaceName,
        reason: excursion.reason ?? null,
        requestedMinutes: excursion.requestedMinutes ?? null,
        grantedMinutes: excursion.grantedMinutes ?? null,
        expiresAt: excursion.expiresAt ?? null,
        distanceM: ctx.distanceM ?? null,
        watcherIds,
        watcherEmails,
        organizationId: entry.organizationId,
      });
    } catch (error) {
      this.logger.error(`Failed to emit ${event}`, error as Error);
    }
  }
}
