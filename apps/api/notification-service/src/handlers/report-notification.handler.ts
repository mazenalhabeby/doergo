import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from '../modules/email/email.service';

@Controller()
export class ReportNotificationHandler {
  private readonly logger = new Logger('ReportNotificationHandler');

  constructor(private readonly emailService: EmailService) {}

  /** Deliver a rendered scheduled report to its recipients (one email each). */
  @EventPattern('report_email')
  async handle(@Payload() data: { recipients: string[]; subject: string; html: string }) {
    const recipients = (data.recipients || []).filter(Boolean);
    this.logger.log(`Sending scheduled report "${data.subject}" to ${recipients.length} recipient(s)`);
    for (const to of recipients) {
      try {
        await this.emailService.sendEmail(to, data.subject, data.html);
      } catch (error) {
        this.logger.error(`Failed to send report email to ${to}: ${error}`);
      }
    }
  }
}
