import { Module } from '@nestjs/common';
import { PushModule } from '../../push/push.module';
import { ApprovalNotificationHandler } from './approval-notification.handler';

/** The approvals inbox: a decision waiting, a second step, a reminder. */
@Module({
  imports: [PushModule],
  controllers: [ApprovalNotificationHandler],
})
export class ApprovalsEventsModule {}
