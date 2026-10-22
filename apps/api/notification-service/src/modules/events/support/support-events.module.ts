import { Module } from '@nestjs/common';
import { PushModule } from '../../push/push.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { SupportNotificationHandler } from './support-notification.handler';

/** Support tickets: a reply, an assignment. */
@Module({
  imports: [PushModule, WebsocketModule],
  controllers: [SupportNotificationHandler],
})
export class SupportEventsModule {}
