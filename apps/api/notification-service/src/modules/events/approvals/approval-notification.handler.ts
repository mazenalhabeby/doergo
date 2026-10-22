import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  approvalReminderEvent,
  approvalSecondStepEvent,
} from '@hbcfield/shared/microservices';
import { ApprovalPushService } from '../../push/approval-push.service';

/** Approvals inbox events. */
@Controller()
export class ApprovalNotificationHandler {
  private readonly logger = new Logger(ApprovalNotificationHandler.name);

  constructor(private readonly approvalPush: ApprovalPushService) {}

  /** An office rule's first approval is in: tell the people who give the second. */
  @EventPattern(eventPattern(approvalSecondStepEvent))
  async handleSecondStep(
    @Payload()
    data: EventPayload<typeof approvalSecondStepEvent>,
  ) {
    if (!data?.recipientIds?.length) return;
    try {
      await this.approvalPush.sendApprovalSecondStepPush({
        recipientIds: data.recipientIds,
        kind: data.kind,
        itemId: data.itemId,
        firstName: data.firstName ?? '',
        subjectName: data.subjectName || undefined,
      });
    } catch (e) {
      this.logger.error(`approval second-step push failed: ${(e as Error).message}`);
    }
  }

  /** Nobody answered an item under an office rule: a reminder, or it is passed on. */
  @EventPattern(eventPattern(approvalReminderEvent))
  async handleReminder(
    @Payload()
    data: EventPayload<typeof approvalReminderEvent>,
  ) {
    if (!data?.recipientIds?.length) return;
    try {
      await this.approvalPush.sendApprovalReminderPush({
        recipientIds: data.recipientIds,
        kind: data.kind,
        itemId: data.itemId,
        stage: data.stage,
        subjectName: data.subjectName ?? '',
        hours: data.hours ?? 0,
      });
    } catch (e) {
      this.logger.error(`approval reminder push failed: ${(e as Error).message}`);
    }
  }
}
