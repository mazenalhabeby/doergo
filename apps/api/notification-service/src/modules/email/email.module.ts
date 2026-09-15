import { Module } from '@nestjs/common';
import { PrismaModule } from '@hbcfield/shared';
import { I18nModule } from '../../i18n/i18n.module';
import { EmailService } from './email.service';
import { MemberEmailsService } from './member-emails.service';

@Module({
  imports: [I18nModule, PrismaModule],
  providers: [EmailService, MemberEmailsService],
  exports: [EmailService, MemberEmailsService],
})
export class EmailModule {}
