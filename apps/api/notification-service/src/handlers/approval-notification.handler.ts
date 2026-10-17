import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ApprovalPushService } from './../modules/push/approval-push.service';

/** Approvals inbox events. */
@Controller()
export class ApprovalNotificationHandler {
  private readonly logger = new Logger(ApprovalNotificationHandler.name);

  constructor(private readonly approvalPush: ApprovalPushService) {}

  /** An office rule's first approval is in: tell the people who give the second. */
  @EventPattern('approval_second_step')
  async handleSecondStep(@Payload() data: { recipientIds?: string[]; kind: string; itemId: string; firstName?: string; subjectName?: string }) {
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
  @EventPattern('approval_reminder')
  async handleReminder(@Payload() data: { recipientIds?: string[]; kind: 'overtime' | 'request' | 'expense'; itemId: string; stage: 'REMIND' | 'ESCALATE'; subjectName?: string; hours?: number }) {
    if (!data?.recipientIds?.length) return;
    try {
      await this.approvalPush.sendApprovalReminderPush({
        recipientIds: data.recipientIds, kind: data.kind, itemId: data.itemId, stage: data.stage,
        subjectName: data.subjectName ?? '', hours: data.hours ?? 0,
      });
    } catch (e) {
      this.logger.error(`approval reminder push failed: ${(e as Error).message}`);
    }
  }
}
