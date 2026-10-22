import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module';
import { ReportNotificationHandler } from './report-notification.handler';

/** A scheduled report, by email. */
@Module({
  imports: [EmailModule],
  controllers: [ReportNotificationHandler],
})
export class ReportsEventsModule {}
