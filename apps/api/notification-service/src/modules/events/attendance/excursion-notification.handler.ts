import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  geofenceExcursionApprovedEvent,
  geofenceExcursionExpiredEvent,
  geofenceExcursionOutEvent,
  geofenceExcursionRejectedEvent,
  geofenceExcursionRequestedEvent,
  geofenceExcursionReturnedEvent,
} from '@hbcfield/shared/microservices';
import { PushService } from '../../push/push.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { NotificationStore } from '../../inbox/notification-store.service';
import { msg, type LocalizedText } from '../../../i18n/translate';
import { GeofenceExcursionEvent } from './attendance-notification-helpers';

/** Away-from-site excursions: out, asked, approved, refused, back, expired. */
@Controller()
export class ExcursionNotificationHandler {
  private readonly logger = new Logger('ExcursionNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  // ── Geofence excursion ("out of ring") ────────────────────────────────────
  // The heartbeat opened an excursion because the worker left their space's ring.
  // Warn the employee (push + their own socket). Also live-update the org so the
  // approver surface reflects the new out-of-ring worker.
  @EventPattern(eventPattern(geofenceExcursionOutEvent))
  async handleExcursionOut(@Payload() data: EventPayload<typeof geofenceExcursionOutEvent>) {
    this.logger.log(`Excursion out: user=${data.userName}, space=${data.spaceName}, ${data.distanceM ?? '?'}m`);
    try {
      await this.pushService.sendToUser(
        data.userId,
        {
          title: msg('attendance.excursionOut.title'),
          body: msg('attendance.excursionOut.body', { space: data.spaceName }),
        },
        { type: 'attendance.geofence_excursion_out', excursionId: data.excursionId },
      );
    } catch (error) {
      this.logger.error(`Failed excursion-out push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_out', data, { includeEmployee: true });
  }

  // Employee submitted a reason + duration → notify the responsible person(s).
  @EventPattern(eventPattern(geofenceExcursionRequestedEvent))
  async handleExcursionRequested(@Payload() data: EventPayload<typeof geofenceExcursionRequestedEvent>) {
    const watcherIds = data.watcherIds || [];
    this.logger.log(`Excursion requested: user=${data.userName}, watchers=${watcherIds.length}`);
    const facts = {
      name: data.userName,
      space: data.spaceName,
      minutes: data.requestedMinutes ?? '?',
      reason: data.reason,
    };
    const text: LocalizedText = {
      title: msg('attendance.excursionRequested.title'),
      body: msg(
        data.reason ? 'attendance.excursionRequested.body' : 'attendance.excursionRequested.bodyNoReason',
        facts,
      ),
    };
    try {
      await this.pushService.sendToUsers(watcherIds, text, {
        type: 'attendance.geofence_excursion_requested',
        excursionId: data.excursionId,
      });
    } catch (error) {
      this.logger.error(`Failed excursion-requested push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_requested', data, { toWatchers: true });
    await this.store.record({
      recipientIds: watcherIds,
      organizationId: data.organizationId,
      eventType: 'geofence_excursion_requested',
      text,
      link: '/attendance?tab=tracking',
    });
  }

  // Approver granted time → notify the employee (push + their socket) + org.
  @EventPattern(eventPattern(geofenceExcursionApprovedEvent))
  async handleExcursionApproved(@Payload() data: EventPayload<typeof geofenceExcursionApprovedEvent>) {
    this.logger.log(`Excursion approved: user=${data.userName}, ${data.grantedMinutes ?? '?'} min`);
    try {
      await this.pushService.sendToUser(
        data.userId,
        {
          title: msg('attendance.excursionApproved.title'),
          body: msg('attendance.excursionApproved.body', { minutes: data.grantedMinutes ?? '?' }),
        },
        { type: 'attendance.geofence_excursion_approved', excursionId: data.excursionId },
      );
    } catch (error) {
      this.logger.error(`Failed excursion-approved push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_approved', data, { includeEmployee: true });
  }

  // Approver rejected → the worker was clocked out. Notify the employee + org.
  @EventPattern(eventPattern(geofenceExcursionRejectedEvent))
  async handleExcursionRejected(@Payload() data: EventPayload<typeof geofenceExcursionRejectedEvent>) {
    this.logger.log(`Excursion rejected: user=${data.userName}`);
    try {
      await this.pushService.sendToUser(
        data.userId,
        { title: msg('attendance.excursionRejected.title'), body: msg('attendance.excursionRejected.body') },
        { type: 'attendance.geofence_excursion_rejected', excursionId: data.excursionId },
      );
    } catch (error) {
      this.logger.error(`Failed excursion-rejected push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_rejected', data, { includeEmployee: true });
  }

  // Worker came back inside the ring → clear the responsible person's alert.
  @EventPattern(eventPattern(geofenceExcursionReturnedEvent))
  async handleExcursionReturned(@Payload() data: EventPayload<typeof geofenceExcursionReturnedEvent>) {
    this.logger.log(`Excursion returned: user=${data.userName}`);
    this.emitExcursionSockets('geofence_excursion_returned', data, { toWatchers: true, includeEmployee: true });
  }

  // APPROVED grace timer lapsed while still out → alert the responsible person(s).
  @EventPattern(eventPattern(geofenceExcursionExpiredEvent))
  async handleExcursionExpired(@Payload() data: EventPayload<typeof geofenceExcursionExpiredEvent>) {
    const watcherIds = data.watcherIds || [];
    this.logger.log(`Excursion expired: user=${data.userName}, watchers=${watcherIds.length}`);
    const text: LocalizedText = {
      title: msg('attendance.excursionExpired.title'),
      body: msg('attendance.excursionExpired.body', { name: data.userName, space: data.spaceName }),
    };
    try {
      await this.pushService.sendToUsers(watcherIds, text, {
        type: 'attendance.geofence_excursion_expired',
        excursionId: data.excursionId,
      });
    } catch (error) {
      this.logger.error(`Failed excursion-expired push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_expired', data, { toWatchers: true, includeEmployee: true });
    await this.store.record({
      recipientIds: watcherIds,
      organizationId: data.organizationId,
      eventType: 'geofence_excursion_expired',
      text,
      link: '/attendance?tab=tracking',
    });
  }

  /**
   * Emit an excursion socket event. Always emits to the org room (drives the web
   * dashboard + approver list via use-realtime-sync). Optionally targets the
   * employee (self-facing states) and/or the resolved watchers (fallback ADMIN room).
   */
  private emitExcursionSockets(
    event: string,
    data: GeofenceExcursionEvent,
    opts: { includeEmployee?: boolean; toWatchers?: boolean },
  ) {
    const payload = {
      excursionId: data.excursionId,
      status: data.status,
      userId: data.userId,
      userName: data.userName,
      spaceId: data.spaceId,
      spaceName: data.spaceName,
      reason: data.reason ?? null,
      requestedMinutes: data.requestedMinutes ?? null,
      grantedMinutes: data.grantedMinutes ?? null,
      expiresAt: data.expiresAt ?? null,
      distanceM: data.distanceM ?? null,
      timestamp: new Date().toISOString(),
    };
    this.websocketGateway.emitToOrganization(data.organizationId, event, payload);
    if (opts.includeEmployee) {
      this.websocketGateway.emitToUser(data.userId, event, payload);
    }
    if (opts.toWatchers) {
      const ids = data.watcherIds || [];
      if (ids.length) {
        for (const id of ids) this.websocketGateway.emitToUser(id, event, payload);
      } else {
        this.websocketGateway.emitToRole(data.organizationId, 'ADMIN', event, payload);
      }
    }
  }
}
