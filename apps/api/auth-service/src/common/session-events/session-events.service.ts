import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';
import {
  emitEvent,
  removePushToken,
  sendRpc,
  organizationSuspendedEvent,
  userSessionsRevokedEvent,
  type EventContract,
} from '@hbcfield/shared/microservices';

/**
 * Telling the live connections that a session has ended.
 *
 * Cutting a session (`User.tokensValidAfter`) stops every NEW request — but an
 * open Socket.IO connection was authenticated once and keeps receiving the
 * organization's events until it drops. These events make notification-service
 * close it now (`SOCKET_REVOCATION_EVENTS` in its websocket module; the names
 * are the contract between the two services).
 *
 * Fire-and-forget on purpose: a password change must not fail because the
 * notification service is restarting. The socket then still ends at its own
 * token expiry, which notification-service enforces separately.
 */
@Injectable()
export class SessionEvents {
  private readonly logger = new Logger(SessionEvents.name);

  constructor(@Inject(SERVICE_NAMES.NOTIFICATION) private readonly notifications: ClientProxy) {}

  /** Every session of this person is over — password change, reset, deactivation, removal. */
  sessionsRevoked(userId: string): void {
    this.emit(userSessionsRevokedEvent, { userId });
  }

  /** The organization was switched off — every member's connection goes. */
  organizationSuspended(organizationId: string): void {
    this.emit(organizationSuspendedEvent, { organizationId });
  }

  /**
   * Signing out stops the pushes to THIS device. notification-service owns the push tokens
   * (docs/data-ownership.md, group F); asked and awaited (5 s), scoped to the member — a token
   * string alone must never unregister somebody else's phone. A failure is logged, never a
   * failed sign-out.
   */
  async signedOutDevice(userId: string, token: string): Promise<void> {
    try {
      await firstValueFrom(sendRpc(this.notifications, removePushToken, { token, userId }).pipe(timeout(5_000)));
    } catch (e) {
      this.logger.warn(`remove_push_token after sign-out failed for ${userId}: ${(e as Error)?.message ?? e}`);
    }
  }

  private emit<P>(contract: EventContract<P>, payload: P): void {
    const event = contract.name;
    try {
      emitEvent(this.notifications, contract, payload).subscribe({
        error: (e) => this.logger.warn(`${event} not delivered: ${e?.message ?? e}`),
      });
    } catch (e) {
      this.logger.warn(`${event} not delivered: ${(e as Error)?.message ?? e}`);
    }
  }
}
