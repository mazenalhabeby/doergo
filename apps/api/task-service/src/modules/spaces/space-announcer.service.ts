import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  PrismaService,
  SERVICE_NAMES,
  autoClockOffered,
  spaceRunsClock,
  activeAssignmentWhere,
} from '@hbcfield/shared';
import {
  emitEvent,
  autoClockOfferedEvent,
  spaceChangedEvent,
  spaceRosterChangedEvent,
} from '@hbcfield/shared/microservices';

const SPACE_EVENTS = { space_changed: spaceChangedEvent, space_roster_changed: spaceRosterChangedEvent } as const;

/**
 * What a workspace change tells the outside world: open clients that a space or
 * its roster moved, and members newly offered the automatic clock.
 */
@Injectable()
export class SpaceAnnouncer {
  private readonly logger = new Logger(SpaceAnnouncer.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Tell open clients a space or its roster moved, so their lists re-read.
   *
   * Fire-and-forget by design: a dropped notification must never fail the
   * mutation that caused it — the clients keep a periodic refetch as a backstop.
   * Carries ids only; every client re-reads through its own scoped endpoint, so
   * nothing here can widen what a viewer is allowed to see.
   */
  announce(event: 'space_changed' | 'space_roster_changed', organizationId: string, spaceId?: string | null) {
    try {
      emitEvent(this.notificationClient, SPACE_EVENTS[event], { organizationId, spaceId: spaceId ?? null });
    } catch (err) {
      this.logger.warn(`Failed to announce ${event} for org ${organizationId}: ${err}`);
    }
  }

  async offerAutoClock(organizationId: string, spaceId: string, onlyUserIds?: string[]) {
    try {
      const space = await this.prisma.companyLocation.findFirst({
        where: { id: spaceId, organizationId, isActive: true, isRemote: false },
        select: {
          name: true,
          autoClock: true,
          enabledModules: true,
          organization: { select: { enabledModules: true } },
        },
      });
      if (!space) return;
      if (!autoClockOffered({ settings: space.autoClock, assignmentAutoClock: true })) return;
      if (
        !spaceRunsClock(space.enabledModules as string[] | null, space.organization?.enabledModules as string[] | null)
      )
        return;
      // Assigned here now — the same window the clock-in reads.
      const { userId: _anyone, ...assignedNow } = activeAssignmentWhere('', new Date());
      const rows = await this.prisma.spaceAssignment.findMany({
        where: {
          ...assignedNow,
          spaceId,
          autoClock: true,
          ...(onlyUserIds ? { userId: { in: onlyUserIds } } : {}),
          user: { autoClockConsentAt: null, isExternal: false, organizationId },
        },
        select: { userId: true },
      });
      const userIds = [...new Set(rows.map((r) => r.userId))];
      if (!userIds.length) return;
      emitEvent(this.notificationClient, autoClockOfferedEvent, {
        organizationId,
        spaceId,
        spaceName: space.name,
        userIds,
      });
    } catch (err) {
      this.logger.warn(`Failed to offer the automatic clock in ${spaceId}: ${err}`);
    }
  }
}
