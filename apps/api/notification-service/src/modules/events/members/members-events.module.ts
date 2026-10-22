import { Module } from '@nestjs/common';
import { InboxModule } from '../../inbox/inbox.module';
import { PushModule } from '../../push/push.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { AppUpdateNotificationHandler } from './app-update-notification.handler';
import { JoinRequestNotificationHandler } from './join-request-notification.handler';

/** Joining: a join request and its answer; a new app version. */
@Module({
  imports: [InboxModule, PushModule, WebsocketModule],
  controllers: [AppUpdateNotificationHandler, JoinRequestNotificationHandler],
})
export class MembersEventsModule {}
