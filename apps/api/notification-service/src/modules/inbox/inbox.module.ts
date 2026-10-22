import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { NotificationStore } from './notification-store.service';
import { I18nModule } from '../../i18n/i18n.module';

/** The in-app inbox (the bell): what is filed there for a member, reading it and marking it read. */
@Module({
  imports: [I18nModule],
  controllers: [InboxController],
  providers: [InboxService, NotificationStore],
  exports: [NotificationStore],
})
export class InboxModule {}
