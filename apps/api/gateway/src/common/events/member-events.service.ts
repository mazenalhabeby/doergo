import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES } from '@hbcfield/shared';

/**
 * "The organization's member list changed."
 *
 * Four different controllers can change who is in an org and what they may do —
 * members (edit / remove), invitations (create / revoke), join requests (approve).
 * Before this existed, none of them told anyone: a second admin's open /members tab
 * kept showing the old roster until they reloaded, because Socket.IO is the only
 * cross-session freshness mechanism the web app has (React Query runs with
 * refetchOnWindowFocus: false). Audit finding M-D2.
 *
 * One service owns the event name and payload shape so the four call sites cannot
 * drift apart, and so there is exactly one place to look when a screen goes stale.
 *
 * The payload is IDS ONLY, deliberately. Every client re-reads through its own
 * scoped endpoint, so this broadcast can never widen what a viewer may see — it is
 * a hint to refetch, not a carrier of data.
 *
 * Fire-and-forget: a failed broadcast must never fail the mutation that caused it.
 * The worst case is the pre-existing behaviour — a stale screen until the next read.
 */
@Injectable()
export class MemberEventsService {
  private readonly logger = new Logger(MemberEventsService.name);

  constructor(
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * @param reason  Free-text tag for the log line only — never used for routing.
   */
  changed(
    organizationId: string | null | undefined,
    memberId?: string,
    reason?: string,
  ): void {
    if (!organizationId) return;
    try {
      this.notificationClient.emit('member_changed', {
        organizationId,
        memberId,
        reason,
      });
    } catch (err) {
      this.logger.warn(
        `member_changed broadcast failed for org ${organizationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

@Global()
@Module({
  providers: [MemberEventsService],
  exports: [MemberEventsService],
})
export class MemberEventsModule {}
