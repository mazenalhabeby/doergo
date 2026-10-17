import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { sendRpc, memberOffboard, spaceShareRelease } from '@hbcfield/shared/microservices';

/**
 * Somebody is leaving — ask task-service to let go of them first.
 *
 * Their open jobs, crew places, role-task places, workspace assignments and
 * equipment custody all belong to task-service (`member_offboard`). Every way
 * of leaving — removal by an admin, deleting your own account — calls this
 * BEFORE detaching the person here, so a refusal leaves them exactly as they
 * were instead of half-gone. The handler is idempotent, so a retry is safe.
 */
@Injectable()
export class MemberOffboarding {
  private readonly logger = new Logger(MemberOffboarding.name);

  constructor(@Inject(SERVICE_NAMES.TASK) private readonly tasks: ClientProxy) {}

  async release(
    organizationId: string,
    userId: string,
    actorId: string,
    opts: { erase?: boolean } = {},
  ): Promise<void> {
    try {
      await firstValueFrom(
        sendRpc(this.tasks, memberOffboard, { organizationId, userId, actorId, erase: opts.erase === true }).pipe(
          timeout(30_000),
        ),
      );
    } catch (e) {
      this.logger.error(`member_offboard failed for ${userId}: ${(e as Error)?.message ?? e}`);
      throw new ServiceUnavailableException(
        'Could not release this member’s jobs and equipment. Nothing was changed — try again.',
      );
    }
  }

  /**
   * A revoked share: the guest organization's people leave the workspace. The
   * share is already REVOKED when this runs (so nobody new can be added), and
   * revoking again re-asks, so a failure here is repaired by pressing Revoke again.
   */
  async releaseSharedSpace(ownerOrgId: string, spaceId: string, guestOrgId: string): Promise<void> {
    try {
      await firstValueFrom(
        sendRpc(this.tasks, spaceShareRelease, { ownerOrgId, spaceId, guestOrgId }).pipe(timeout(30_000)),
      );
    } catch (e) {
      this.logger.error(`space_share_release failed for ${spaceId}/${guestOrgId}: ${(e as Error)?.message ?? e}`);
      throw new ServiceUnavailableException(
        'The share is revoked, but its people could not be removed from the ' + 'workspace yet — revoke it again.',
      );
    }
  }
}
