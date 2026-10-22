import { Module } from '@nestjs/common';
import { InboxModule } from '../../inbox/inbox.module';
import { PushModule } from '../../push/push.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { AssetLogNotificationHandler } from './asset-log-notification.handler';
import { AssetNotificationHandler } from './asset-notification.handler';
import { AssetProposalNotificationHandler } from './asset-proposal-notification.handler';

/** Equipment: handovers, expenses, papers sent in, the logbook's due reminders. */
@Module({
  imports: [InboxModule, PushModule, WebsocketModule],
  controllers: [AssetLogNotificationHandler, AssetNotificationHandler, AssetProposalNotificationHandler],
})
export class AssetsEventsModule {}
