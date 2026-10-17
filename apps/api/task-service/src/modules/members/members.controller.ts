import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { success } from '@hbcfield/shared';
import { MemberOffboardService } from './member-offboard.service';
import { pattern, type RpcRequest, memberOffboard, spaceShareRelease } from '@hbcfield/shared/microservices';

@Controller()
export class MembersController {
  constructor(private readonly offboarding: MemberOffboardService) {}

  /** Asked by auth-service whenever somebody leaves — see MemberOffboardService. */
  @MessagePattern(pattern(memberOffboard))
  async offboard(@Payload() data: RpcRequest<typeof memberOffboard>) {
    return success(await this.offboarding.offboard(data));
  }

  /** Asked by auth-service when a shared workspace is revoked. */
  @MessagePattern(pattern(spaceShareRelease))
  async releaseSharedSpace(@Payload() data: RpcRequest<typeof spaceShareRelease>) {
    return success(await this.offboarding.releaseSharedSpace(data));
  }
}
