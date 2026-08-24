import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES } from '@hbcfield/shared';

/**
 * "Something changed for this organization — go and re-read it."
 *
 * One service for every cross-session refresh signal the gateway sends. It began
 * as MemberEventsService, gained a near-identical SpaceEventsService, and was about
 * to gain a third for CRM before the duplication was the finding: three copies of
 * the same emit/try/catch/log with different nouns.
 *
 * Two rules hold for everything here, and they are the reason a broadcast is safe:
 *
 *  1. **Ids only.** The payload never carries data. Every client re-reads through
 *     its own scoped endpoint, so a broadcast can never widen what a viewer may
 *     see — it is a hint to refetch, not a delivery of content.
 *  2. **Fire-and-forget.** A failed broadcast must never fail the mutation behind
 *     it. The worst case is the behaviour we already had: a stale screen until the
 *     next read.
 */
@Injectable()
export class OrgEventsService {
  private readonly logger = new Logger(OrgEventsService.name);

  constructor(
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  private announce(
    organizationId: string | null | undefined,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    if (!organizationId) return;
    try {
      this.notificationClient.emit(event, { organizationId, ...payload });
    } catch (err) {
      this.logger.warn(
        `${event} broadcast failed for org ${organizationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * The org's member list changed — someone added, removed, re-roled, re-scoped,
   * invited, or an invitation revoked. Five controllers can cause this.
   * @param reason free-text tag for the log line only; never used for routing.
   */
  memberChanged(organizationId: string | null | undefined, memberId?: string, reason?: string): void {
    this.announce(organizationId, 'member_changed', { memberId, reason });
  }

  /** A space was created, renamed, archived, restored or purged. */
  spaceChanged(organizationId: string | null | undefined, spaceId?: string | null): void {
    this.announce(organizationId, 'space_changed', { spaceId: spaceId ?? null });
  }

  /**
   * A cross-org share moved: tell BOTH sides. The guest is the half that actually
   * gains or loses something and the half that is not making the request, so it is
   * the half most easily forgotten.
   */
  shareChanged(
    ownerOrgId: string | null | undefined,
    guestOrgId: string | null | undefined,
    spaceId?: string | null,
  ): void {
    this.spaceChanged(ownerOrgId, spaceId);
    if (guestOrgId && guestOrgId !== ownerOrgId) this.spaceChanged(guestOrgId, spaceId);
  }

  /**
   * A client record or its activity timeline changed. Reps who cannot reach that
   * client will refetch and get back what they are allowed to see — the scoping
   * lives in the endpoint, not in who receives the hint.
   */
  customerChanged(organizationId: string | null | undefined, customerId?: string): void {
    this.announce(organizationId, 'customer_changed', { customerId });
  }
}

@Global()
@Module({
  providers: [OrgEventsService],
  exports: [OrgEventsService],
})
export class OrgEventsModule {}
