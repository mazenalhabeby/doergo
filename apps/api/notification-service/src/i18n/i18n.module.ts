import { Module } from '@nestjs/common';
import { PrismaModule } from '@hbcfield/shared';
import { RecipientLocales } from './recipient-locales.service';

/**
 * One RecipientLocales for the whole service.
 *
 * Push, the bell and email all ask "which language does this person read", and
 * each asking its own copy would mean three caches that learn a language change
 * at three different moments — a push in German and the email about the same
 * event in English, a minute apart.
 */
@Module({
  imports: [PrismaModule],
  providers: [RecipientLocales],
  exports: [RecipientLocales],
})
export class I18nModule {}
