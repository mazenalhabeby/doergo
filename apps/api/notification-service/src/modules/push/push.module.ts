import { Module } from '@nestjs/common';
import { PrismaModule } from '@hbcfield/shared';
import { PushService } from './push.service';
import { I18nModule } from '../../i18n/i18n.module';

@Module({
  imports: [PrismaModule, I18nModule],
  // I18nModule is re-exported because the bell (NotificationStore) writes the
  // same sentences in the same per-recipient language as the push.
  providers: [PushService],
  exports: [PushService, I18nModule],
})
export class PushModule {}
