import { Injectable, Logger, Optional } from '@nestjs/common';
import { isOnTheClock, PrismaService, SocketEvents } from '@hbcfield/shared';
import { MemberFactsClient } from '../../common/member-facts/member-facts.client';
import { SocketRegistry } from './socket-registry';

/**
 * Who is online: marked on the first socket, kept fresh by a heartbeat while any socket
 * is open, and flipped offline only after a grace window once the LAST socket drops.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger('WebSocketGateway');
  // Pending "mark offline" timers, keyed by userId. When a user's LAST socket
  // drops we wait out a grace window (survives refresh / reconnect / network
  // blips) before flipping them offline. A new authenticate cancels it.
  private readonly offlineTimers = new Map<string, NodeJS.Timeout>();
  // Grace window before an ungraceful disconnect is treated as "offline".
  private readonly OFFLINE_GRACE_MS = 60000;
  // Server-side "still here" heartbeat: while a socket is connected the user is
  // online, even if their browser is idle and makes no API calls. We refresh
  // lastActiveAt for all connected users on this interval so an open-but-idle
  // tab never falls out of the 3-minute online window. One query per tick,
  // regardless of how many users are connected.
  private readonly HEARTBEAT_MS = 60000;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    private readonly registry: SocketRegistry,
    private readonly prisma: PrismaService,
    // The auth-service client for presence (auth-service owns User).
    @Optional() private readonly memberFacts?: MemberFactsClient,
  ) {}

  /** Keep connected users "online" while their tab is open (see HEARTBEAT_MS). */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      void this.refreshConnectedPresence();
    }, this.HEARTBEAT_MS);
  }

  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const timer of this.offlineTimers.values()) clearTimeout(timer);
    this.offlineTimers.clear();
  }

  /** Bump lastActiveAt for every currently-connected user in one query. */
  async refreshConnectedPresence() {
    const userIds = new Set<string>();
    for (const info of this.registry.clients.values()) userIds.add(info.userId);
    if (userIds.size === 0) return;

    // auth-service owns User (docs/data-ownership.md, group F); a failure is logged there, never thrown.
    await this.memberFacts?.markActive(Array.from(userIds));
  }

  /** Reconnected within the grace window → cancel any pending "mark offline". */
  cancelOfflineCheck(userId: string) {
    const pendingOffline = this.offlineTimers.get(userId);
    if (pendingOffline) {
      clearTimeout(pendingOffline);
      this.offlineTimers.delete(userId);
    }
  }

  scheduleOfflineCheck(userId: string, organizationId: string) {
    const existing = this.offlineTimers.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.offlineTimers.delete(userId);
      void this.markOfflineIfIdle(userId, organizationId);
    }, this.OFFLINE_GRACE_MS);

    this.offlineTimers.set(userId, timer);
  }

  async markOnline(userId: string, organizationId: string, wasOffline: boolean) {
    try {
      const presence = await this.memberFacts?.markActive([userId], wasOffline);

      // Only broadcast on a real offline→online transition, so opening a second
      // tab or a socket reconnect doesn't spam every dashboard with refetches.
      if (wasOffline) {
        this.emitPresenceChanged(userId, presence?.[userId] ?? 'AVAILABLE', organizationId);
      }
    } catch (err) {
      this.logger.warn(`[PRESENCE] online mark failed for user ${userId}: ${err}`);
    }
  }

  private async markOfflineIfIdle(userId: string, organizationId: string) {
    // Reconnected during the grace window? Leave them online.
    if (this.registry.userHasActiveSocket(userId)) return;

    try {
      // Clocked-in guard: a technician driving or working on-site with the app
      // backgrounded is still "at work" — never mark them offline. Their clock-in
      // (a DB record) is untouched regardless.
      if (await isOnTheClock(this.prisma, userId)) return;

      // Genuinely gone: clear last-active so they compute as offline, then push.
      await this.memberFacts?.markInactive(userId);

      this.emitPresenceChanged(userId, null, organizationId);
    } catch (err) {
      this.logger.warn(`[PRESENCE] offline check failed for user ${userId}: ${err}`);
    }
  }

  // Availability (Available/Busy/Away) changed — org-wide (teammates see status
  // on dashboards / contact lists). Low frequency, so a plain org broadcast.
  emitPresenceChanged(userId: string, presence: string | null, organizationId: string) {
    this.logger.debug(`[EMIT] presence.changed for user ${userId} -> ${presence}`);
    this.registry.messagesSent += 1;
    this.registry.server.to(`org:${organizationId}`).emit(SocketEvents.PRESENCE_CHANGED, { userId, presence });
  }
}
