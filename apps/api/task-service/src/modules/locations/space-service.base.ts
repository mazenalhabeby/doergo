import { Inject, Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  SERVICE_NAMES,
  validateGeofencePolygon,
  type GeofencePolygonError,
  COST_ON_PROFILE_MESSAGE,
  autoClockOffered,
  spaceRunsClock,
  activeAssignmentWhere,
  writeRateChange,
  RateChangeError,
  usableLegalEntityId,
  COMPANY_UNKNOWN_MESSAGE,
} from '@hbcfield/shared';
import {
  emitEvent,
  autoClockOfferedEvent,
  spaceChangedEvent,
  spaceRosterChangedEvent,
} from '@hbcfield/shared/microservices';

const SPACE_EVENTS = { space_changed: spaceChangedEvent, space_roster_changed: spaceRosterChangedEvent } as const;

/**
 * What every workspace service shares: its dependencies, announcing a change,
 * offering the automatic clock, a workspace's company, its boundary and its rates.
 */
@Injectable()
export abstract class SpaceServiceBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    protected readonly notificationClient: ClientProxy,
  ) {}

  /** A workspace's company: one of this organization's active companies, or null. Anything else is refused. */
  protected async spaceCompany(organizationId: string, value: unknown): Promise<string | null | undefined> {
    const r = await usableLegalEntityId(this.prisma, organizationId, value);
    if (!r.ok) throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: 'COMPANY_UNKNOWN' });
    return r.id;
  }

  /**
   * Tell open clients a space or its roster moved, so their lists re-read.
   *
   * Fire-and-forget by design: a dropped notification must never fail the
   * mutation that caused it — the clients keep a periodic refetch as a backstop.
   * Carries ids only; every client re-reads through its own scoped endpoint, so
   * nothing here can widen what a viewer is allowed to see.
   */
  protected announce(event: 'space_changed' | 'space_roster_changed', organizationId: string, spaceId?: string | null) {
    try {
      emitEvent(this.notificationClient, SPACE_EVENTS[event], { organizationId, spaceId: spaceId ?? null });
    } catch (err) {
      this.logger.warn(`Failed to announce ${event} for org ${organizationId}: ${err}`);
    }
  }

  protected async offerAutoClock(organizationId: string, spaceId: string, onlyUserIds?: string[]) {
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

  /**
   * A drawn boundary decides whether people can start their shift, and it
   * arrives as free-form JSON, so it is validated here rather than trusted.
   *
   * The area cap is the security-relevant one: a boundary drawn around half a
   * city would leave the control looking configured while accepting anybody
   * anywhere. The vertex cap bounds the stored JSON and the per-clock-in scan.
   *
   * `null` clears the boundary and returns the site to its radius.
   */
  protected cleanPolygon(input: unknown): { lat: number; lng: number }[] | null {
    if (input === null || input === undefined) return null;

    const result = validateGeofencePolygon(input);
    if (result.ok) return result.ring;

    const reason: Record<GeofencePolygonError, string> = {
      TOO_FEW_POINTS: 'A site boundary needs at least three points.',
      TOO_MANY_POINTS: 'A site boundary can have at most 60 points.',
      INVALID_COORDINATE: 'The site boundary contains a point that is not a valid coordinate.',
      AREA_TOO_LARGE:
        'That boundary covers more than 5 km² — too large to be a single site. Draw the property, not the district.',
    };
    throw new BadRequestException(reason[result.error]);
  }

  /**
   * A workspace's hourly rates, through the shared dated writer.
   *
   * Undefined leaves a rate alone; null clears it back to "inherit". Each one
   * written is a history row from `rateEffectiveFrom` (default today) and then
   * the column set to whatever is in force today — in one transaction.
   */
  protected async writeSpaceRates(
    spaceId: string,
    organizationId: string,
    data: { billableRateCents?: number | null; costRateCents?: number | null; rateEffectiveFrom?: string },
    createdById?: string,
  ) {
    if (data.billableRateCents === undefined && data.costRateCents === undefined) return;
    // What a person costs lives on their profile (rate-ladder LEVELS_BY_KIND), never on a workspace.
    if (data.costRateCents !== undefined) throw new BadRequestException(COST_ON_PROFILE_MESSAGE);
    try {
      await this.prisma.$transaction(async (tx) => {
        const patch: Record<string, number | null> = {};
        const write = (kind: 'BILL_HOUR' | 'COST_HOUR', cents: number | null | undefined) =>
          writeRateChange(tx, {
            organizationId,
            target: 'SPACE',
            targetId: spaceId,
            kind,
            cents,
            effectiveFrom: data.rateEffectiveFrom,
            createdById: createdById ?? null,
          });
        if (data.billableRateCents !== undefined)
          patch.billableRateCents = (await write('BILL_HOUR', data.billableRateCents)).nowCents;
        if (data.costRateCents !== undefined)
          patch.costRateCents = (await write('COST_HOUR', data.costRateCents)).nowCents;
        await tx.companyLocation.update({ where: { id: spaceId }, data: patch });
      });
    } catch (e) {
      if (e instanceof RateChangeError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
