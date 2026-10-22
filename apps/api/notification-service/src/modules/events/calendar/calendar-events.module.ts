import { Module } from '@nestjs/common';
import { InboxModule } from '../../inbox/inbox.module';
import { PushModule } from '../../push/push.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { CalendarNotificationHandler } from './calendar-notification.handler';

/** The calendar: invitations and reminders. */
@Module({
  imports: [InboxModule, PushModule, WebsocketModule],
  controllers: [CalendarNotificationHandler],
})
export class CalendarEventsModule {}
