import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  pattern,
  type EventPayload,
  type RpcRequest,
  notificationEraseMember,
  registerPushToken,
  removePushToken,
  userLocaleChangedEvent,
} from '@hbcfield/shared/microservices';
import { PushService } from './push.service';
import { RecipientLocales } from '../../i18n/recipient-locales.service';

/** A member's push devices: register, remove, erase — and forget a cached language when it changes. */
@Controller()
export class PushController {
  private readonly logger = new Logger('PushController');

  constructor(
    private readonly pushService: PushService,
    private readonly recipientLocales: RecipientLocales,
  ) {}

  @MessagePattern(pattern(registerPushToken))
  async registerPushToken(@Payload() data: RpcRequest<typeof registerPushToken>) {
    this.logger.log(`Registering push token for user ${data.userId}`);
    return this.pushService.registerPushToken(data);
  }

  /**
   * The member changed language on the profile endpoint, which auth-service
   * wrote. Forget the cached one here so the next push reads the new value
   * instead of waiting out the cache.
   */
  @EventPattern(eventPattern(userLocaleChangedEvent))
  handleUserLocaleChanged(@Payload() data: EventPayload<typeof userLocaleChangedEvent>) {
    if (data?.userId) this.recipientLocales.forget(data.userId);
  }

  /** A member deleting their account (auth-service's account deletion asks — notification owns the tokens). */
  @MessagePattern(pattern(notificationEraseMember))
  async eraseMember(@Payload() data: RpcRequest<typeof notificationEraseMember>) {
    return this.pushService.eraseMember(data.userId);
  }

  @MessagePattern(pattern(removePushToken))
  async removePushToken(@Payload() data: RpcRequest<typeof removePushToken>) {
    this.logger.log(`Removing push token: ${data.token.substring(0, 20)}...`);
    return this.pushService.removePushToken(data.token, data.userId);
  }
}
