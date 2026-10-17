import { SocketEvents } from '@hbcfield/shared';
import { GatewayTaskEmitsBase } from './gateway-task-emits.base';

/**
 * Who is online, and the attendance events — moved here unchanged from
 * websocket.gateway.ts.
 */
export abstract class GatewayPresenceBase extends GatewayTaskEmitsBase {
  /** Bump lastActiveAt for every currently-connected user in one query. */
  protected async refreshConnectedPresence() {
    const userIds = new Set<string>();
    for (const info of this.connectedClients.values()) userIds.add(info.userId);
    if (userIds.size === 0) return;

    await this.prisma.user
      .updateMany({
        where: { id: { in: Array.from(userIds) } },
        data: { lastActiveAt: new Date() },
      })
      .catch((err) => this.logger.warn(`[PRESENCE] heartbeat failed: ${err}`));
  }

  protected scheduleOfflineCheck(userId: string, organizationId: string) {
    const existing = this.offlineTimers.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.offlineTimers.delete(userId);
      void this.markOfflineIfIdle(userId, organizationId);
    }, this.OFFLINE_GRACE_MS);

    this.offlineTimers.set(userId, timer);
  }

  protected async markOnline(userId: string, organizationId: string, wasOffline: boolean) {
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() },
        select: { presence: true },
      });

      // Only broadcast on a real offline→online transition, so opening a second
      // tab or a socket reconnect doesn't spam every dashboard with refetches.
      if (wasOffline) {
        this.emitPresenceChanged(userId, updated.presence ?? 'AVAILABLE', organizationId);
      }
    } catch (err) {
      this.logger.warn(`[PRESENCE] online mark failed for user ${userId}: ${err}`);
    }
  }

  protected async markOfflineIfIdle(userId: string, organizationId: string) {
    // Reconnected during the grace window? Leave them online.
    if (this.userHasActiveSocket(userId)) return;

    try {
      // Clocked-in guard: a technician driving or working on-site with the app
      // backgrounded is still "at work" — never mark them offline. Their clock-in
      // (a DB record) is untouched regardless.
      const openEntry = await this.prisma.timeEntry.findFirst({
        where: { userId, status: 'CLOCKED_IN' },
        select: { id: true },
      });
      if (openEntry) return;

      // Genuinely gone: clear last-active so they compute as offline, then push.
      await this.prisma.user.update({ where: { id: userId }, data: { lastActiveAt: null } }).catch(() => undefined);

      this.emitPresenceChanged(userId, null, organizationId);
    } catch (err) {
      this.logger.warn(`[PRESENCE] offline check failed for user ${userId}: ${err}`);
    }
  }

  // =========================================================================
  // ATTENDANCE EVENTS
  // =========================================================================

  emitClockIn(userId: string, organizationId: string, timeEntry: unknown) {
    this.logger.log(`[EMIT] attendance.clockIn for user ${userId}`);
    this.messagesSent += 1;
    // Single de-duplicated emit: a socket in BOTH rooms (e.g. the user viewing
    // their own org) would otherwise receive two copies.
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.CLOCK_IN, { userId, timeEntry });
  }

  emitClockOut(userId: string, organizationId: string, timeEntry: unknown) {
    this.logger.log(`[EMIT] attendance.clockOut for user ${userId}`);
    this.messagesSent += 1;
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.CLOCK_OUT, { userId, timeEntry });
  }

  // =========================================================================
  // BREAK EVENTS
  // =========================================================================

  emitBreakStarted(userId: string, organizationId: string, breakData: unknown) {
    this.logger.log(`[EMIT] break.started for user ${userId}`);
    this.messagesSent += 1;
    this.server
      .to(`user:${userId}`)
      .to(`org:${organizationId}`)
      .emit(SocketEvents.BREAK_STARTED, { userId, break: breakData });
  }

  emitBreakEnded(userId: string, organizationId: string, breakData: unknown) {
    this.logger.log(`[EMIT] break.ended for user ${userId}`);
    this.messagesSent += 1;
    this.server
      .to(`user:${userId}`)
      .to(`org:${organizationId}`)
      .emit(SocketEvents.BREAK_ENDED, { userId, break: breakData });
  }

  // Availability (Available/Busy/Away) changed — org-wide (teammates see status
  // on dashboards / contact lists). Low frequency, so a plain org broadcast.
  emitPresenceChanged(userId: string, presence: string | null, organizationId: string) {
    this.logger.debug(`[EMIT] presence.changed for user ${userId} -> ${presence}`);
    this.messagesSent += 1;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.PRESENCE_CHANGED, { userId, presence });
  }
}
