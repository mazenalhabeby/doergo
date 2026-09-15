import { Module } from '@nestjs/common';
import { PrismaModule } from '@hbcfield/shared';
import { PushService } from './push.service';
import { RecipientLocales } from '../../i18n/recipient-locales.service';

@Module({
  imports: [PrismaModule],
  // RecipientLocales is exported because the bell (NotificationStore) writes
  // the same sentences in the same per-recipient language as the push.
  providers: [PushService, RecipientLocales],
  exports: [PushService, RecipientLocales],
})
export class PushModule {}
