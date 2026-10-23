import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, personNameAndEmail } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { personName, SERVICE_NAMES } from '@hbcfield/shared';
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

/**
 * Telling people about an away-from-site excursion — the one announcer the
 * heartbeat, the batched heartbeat and the excursion decisions share.
 */
@Injectable()
export class ExcursionNotices {
  private readonly logger = new Logger(ExcursionNotices.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly notificationRouting: NotificationRoutingService,
  ) {}

  /**
   * Resolve recipients and emit an excursion event. "responsible" events route
   * through resolveWatchers (same set as geofence/pending-approval alerts);
   * employee-facing events go to the employee. Also fires a push.
   */
  async announce(
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
