import { Module } from '@nestjs/common';
import { PrismaModule } from '@hbcfield/shared';
import { PushService } from './push.service';
import { I18nModule } from '../../i18n/i18n.module';
import { TaskPushService } from './task-push.service';
import { AttendancePushService } from './attendance-push.service';
import { ApprovalPushService } from './approval-push.service';
import { ClockPushBudgetService } from './clock-push-budget.service';

@Module({
  imports: [PrismaModule, I18nModule],
  // I18nModule is re-exported because the bell (NotificationStore) writes the
  // same sentences in the same per-recipient language as the push.
  providers: [PushService, TaskPushService, AttendancePushService, ApprovalPushService, ClockPushBudgetService],
  exports: [PushService, TaskPushService, AttendancePushService, ApprovalPushService, I18nModule],
})
export class PushModule {}
