import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { eventPattern, invitationCreatedEvent, type EventPayload } from '@hbcfield/shared/microservices';
import { EmailService } from './email.service';

/** An invitation was created: email the code to the person invited. */
@Controller()
export class InvitationEmailController {
  private readonly logger = new Logger('InvitationEmailController');

  constructor(private readonly emailService: EmailService) {}

  @EventPattern(eventPattern(invitationCreatedEvent))
  async handleInvitationCreated(
    @Payload()
    data: EventPayload<typeof invitationCreatedEvent>,
  ) {
    this.logger.log(`Sending invitation email to ${data.recipientEmail} for org ${data.organizationName}`);
    // ⚠️ invitationCode may be null (an invitation without a stored code) — passed on as before.
    await this.emailService.sendInvitationEmail(data as typeof data & { invitationCode: string });
  }
}
