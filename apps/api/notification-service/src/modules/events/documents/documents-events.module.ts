import { Module } from '@nestjs/common';
import { PushModule } from '../../push/push.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { DocumentNotificationHandler } from './document-notification.handler';

/** The personnel file: a document to sign, read or hand in. */
@Module({
  imports: [PushModule, WebsocketModule],
  controllers: [DocumentNotificationHandler],
})
export class DocumentsEventsModule {}
