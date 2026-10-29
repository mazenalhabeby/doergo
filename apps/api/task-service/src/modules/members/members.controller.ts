import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { success } from '@hbcfield/shared';
import { MemberOffboardService } from './member-offboard.service';
import {
  eventPattern,
  type EventPayload,
  memberDeactivatedEvent,
  pattern,
  type RpcRequest,
  memberOffboard,
  spaceShareRelease,
  taskEraseMember,
} from '@hbcfield/shared/microservices';

@Controller()
export class MembersController {
  constructor(private readonly offboarding: MemberOffboardService) {}

  /** Asked by auth-service whenever somebody leaves — see MemberOffboardService. */
  @MessagePattern(pattern(memberOffboard))
  async offboard(@Payload() data: RpcRequest<typeof memberOffboard>) {
    return success(await this.offboarding.offboard(data));
  }

  /** Told by auth-service when a member is switched off — see MemberOffboardService.deactivated. */
  @EventPattern(eventPattern(memberDeactivatedEvent))
  async deactivated(@Payload() data: EventPayload<typeof memberDeactivatedEvent>) {
    if (!data?.userId || !data.organizationId) return;
    await this.offboarding.deactivated(data);
  }

  /** Asked by auth-service when somebody deletes their account — see MemberOffboardService.eraseMember. */
  @MessagePattern(pattern(taskEraseMember))
  eraseMember(@Payload() data: RpcRequest<typeof taskEraseMember>) {
    return this.offboarding.eraseMember(data.userId);
  }

  /** Asked by auth-service when a shared workspace is revoked. */
  @MessagePattern(pattern(spaceShareRelease))
  async releaseSharedSpace(@Payload() data: RpcRequest<typeof spaceShareRelease>) {
    return success(await this.offboarding.releaseSharedSpace(data));
  }
}
