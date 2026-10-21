import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  userMarkInactive,
  usersMarkActive,
  userSetAutoClockConsent,
  userSetLocale,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import { MemberFactsService } from './member-facts.service';

/** Facts about a member learned by notification-service and task-service (auth owns `User`). */
@Controller()
export class MemberFactsController {
  constructor(private readonly facts: MemberFactsService) {}

  @MessagePattern(pattern(usersMarkActive))
  markActive(@Payload() data: RpcRequest<typeof usersMarkActive>) {
    return this.facts.markActive(data);
  }

  @MessagePattern(pattern(userMarkInactive))
  markInactive(@Payload() data: RpcRequest<typeof userMarkInactive>) {
    return this.facts.markInactive(data);
  }

  @MessagePattern(pattern(userSetLocale))
  setLocale(@Payload() data: RpcRequest<typeof userSetLocale>) {
    return this.facts.setLocale(data);
  }

  @MessagePattern(pattern(userSetAutoClockConsent))
  setAutoClockConsent(@Payload() data: RpcRequest<typeof userSetAutoClockConsent>) {
    return this.facts.setAutoClockConsent(data);
  }
}
