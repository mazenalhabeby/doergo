import { Module } from '@nestjs/common';
import { PushModule } from '../../push/push.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { ChatNotificationHandler } from './chat-notification.handler';

/** Chat: a new message. */
@Module({
  imports: [PushModule, WebsocketModule],
  controllers: [ChatNotificationHandler],
})
export class ChatEventsModule {}
