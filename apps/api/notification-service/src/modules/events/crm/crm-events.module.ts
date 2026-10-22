import { Module } from '@nestjs/common';
import { InboxModule } from '../../inbox/inbox.module';
import { PushModule } from '../../push/push.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { CrmReminderHandler } from './crm-reminder.handler';

/** Client follow-ups that are due. */
@Module({
  imports: [InboxModule, PushModule, WebsocketModule],
  controllers: [CrmReminderHandler],
})
export class CrmEventsModule {}
