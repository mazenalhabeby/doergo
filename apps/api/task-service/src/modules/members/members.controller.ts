import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { success } from '@hbcfield/shared';
import { MemberOffboardService } from './member-offboard.service';

@Controller()
export class MembersController {
  constructor(private readonly offboarding: MemberOffboardService) {}

  /** Asked by auth-service whenever somebody leaves — see MemberOffboardService. */
  @MessagePattern({ cmd: 'member_offboard' })
  async offboard(@Payload() data: { organizationId: string; userId: string; actorId: string }) {
    return success(await this.offboarding.offboard(data));
  }
}
