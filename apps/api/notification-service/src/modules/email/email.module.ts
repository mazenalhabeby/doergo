import { Module } from '@nestjs/common';
import { I18nModule } from '../../i18n/i18n.module';
import { EmailService } from './email.service';

@Module({
  imports: [I18nModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
