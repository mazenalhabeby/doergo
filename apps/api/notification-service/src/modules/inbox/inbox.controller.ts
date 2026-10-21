import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { listNotifications, markNotificationsRead, pattern, type RpcRequest } from '@hbcfield/shared/microservices';
import { InboxService } from './inbox.service';

@Controller()
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @MessagePattern(pattern(listNotifications))
  list(@Payload() data: RpcRequest<typeof listNotifications>) {
    return this.inbox.list(data.userId, data.limit);
  }

  @MessagePattern(pattern(markNotificationsRead))
  markRead(@Payload() data: RpcRequest<typeof markNotificationsRead>) {
    return this.inbox.markRead(data.userId, data.ids);
  }
}
