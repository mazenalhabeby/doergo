import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES } from '@hbcfield/shared';

/**
 * "A space changed for this organization."
 *
 * task-service already announces `space_changed` when a space is created, renamed,
 * archived or restored. Cross-org SHARING is the one lifecycle event it cannot
 * announce, for a structural reason: a share changes what **two** organizations can
 * see, and the guest org is not the one performing the mutation.
 *
 * Before this, granting or revoking a share emitted nothing at all (audit S-D2).
 * The guest's spaces list kept showing a space they had just lost access to — until
 * their auth cache expired and it silently vanished with no explanation — and the
 * owner's other admins never saw the share appear.
 *
 * Fire-and-forget: a failed broadcast must never fail the mutation behind it. The
 * worst case is the pre-existing behaviour, a stale list until the next read.
 */
@Injectable()
export class SpaceEventsService {
  private readonly logger = new Logger(SpaceEventsService.name);

  constructor(
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Announce to one organization. Ids only — each client re-reads through its own
   * scoped endpoint, so this can never widen what a viewer is allowed to see.
   */
  changed(organizationId: string | null | undefined, spaceId?: string | null): void {
    if (!organizationId) return;
    try {
      this.notificationClient.emit('space_changed', { organizationId, spaceId: spaceId ?? null });
    } catch (err) {
      this.logger.warn(
        `space_changed broadcast failed for org ${organizationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * A share moved: tell BOTH sides. The guest is the half that actually gained or
   * lost something and the half that is not making the request, so it is the half
   * most easily forgotten.
   */
  shareChanged(
    ownerOrgId: string | null | undefined,
    guestOrgId: string | null | undefined,
    spaceId?: string | null,
  ): void {
    this.changed(ownerOrgId, spaceId);
    if (guestOrgId && guestOrgId !== ownerOrgId) this.changed(guestOrgId, spaceId);
  }
}

@Global()
@Module({
  providers: [SpaceEventsService],
  exports: [SpaceEventsService],
})
export class SpaceEventsModule {}
