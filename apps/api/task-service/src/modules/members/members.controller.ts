import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { success } from '@hbcfield/shared';
import { MemberOffboardService } from './member-offboard.service';

@Controller()
export class MembersController {
  constructor(private readonly offboarding: MemberOffboardService) {}

  /** Asked by auth-service whenever somebody leaves — see MemberOffboardService. */
  @MessagePattern({ cmd: 'member_offboard' })
  async offboard(@Payload() data: { organizationId: string; userId: string; actorId: string; erase?: boolean }) {
    return success(await this.offboarding.offboard(data));
  }

  /** Asked by auth-service when a shared workspace is revoked. */
  @MessagePattern({ cmd: 'space_share_release' })
  async releaseSharedSpace(@Payload() data: { ownerOrgId: string; spaceId: string; guestOrgId: string }) {
    return success(await this.offboarding.releaseSharedSpace(data));
  }
}
