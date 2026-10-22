import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@hbcfield/shared';
import { RetentionService } from './common/retention/retention.service';
import { EmailModule } from './modules/email/email.module';
import { PushModule } from './modules/push/push.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { MemberFactsModule } from './common/member-facts/member-facts.module';
import { TaskNotificationHandler } from './modules/events/tasks/task-notification.handler';
import { RoleTaskNotificationHandler } from './modules/events/tasks/role-task-notification.handler';
import { CrewNotificationHandler } from './modules/events/tasks/crew-notification.handler';
import { TaskLiveHandler } from './modules/events/tasks/task-live.handler';
import { CalendarNotificationHandler } from './modules/events/calendar/calendar-notification.handler';
import { AttendanceNotificationHandler } from './modules/events/attendance/attendance-notification.handler';
import { BreakNotificationHandler } from './modules/events/attendance/break-notification.handler';
import { NoShowNotificationHandler } from './modules/events/attendance/no-show-notification.handler';
import { AttendanceAlertsHandler } from './modules/events/attendance/attendance-alerts.handler';
import { DayDecidedHandler } from './modules/events/attendance/day-decided.handler';
import { ExcursionNotificationHandler } from './modules/events/attendance/excursion-notification.handler';
import { AttendanceLiveHandler } from './modules/events/attendance/attendance-live.handler';
import { JoinRequestNotificationHandler } from './modules/events/members/join-request-notification.handler';
import { SupportNotificationHandler } from './modules/events/support/support-notification.handler';
import { AssetProposalNotificationHandler } from './modules/events/assets/asset-proposal-notification.handler';
import { AssetNotificationHandler } from './modules/events/assets/asset-notification.handler';
import { AssetLogNotificationHandler } from './modules/events/assets/asset-log-notification.handler';
import { OvertimeNotificationHandler } from './modules/events/attendance/overtime-notification.handler';
import { ShiftIssueNotificationHandler } from './modules/events/attendance/shift-issue-notification.handler';
import { ApprovalNotificationHandler } from './modules/events/approvals/approval-notification.handler';
import { ChatNotificationHandler } from './modules/events/chat/chat-notification.handler';
import { ReportNotificationHandler } from './modules/events/reports/report-notification.handler';
import { CrmReminderHandler } from './modules/events/crm/crm-reminder.handler';
import { DocumentNotificationHandler } from './modules/events/documents/document-notification.handler';
import { TimeOffNotificationHandler } from './modules/events/attendance/time-off-notification.handler';
import { AppUpdateNotificationHandler } from './modules/events/members/app-update-notification.handler';
import { ApprovalsEventsModule } from './modules/events/approvals/approvals-events.module';
import { AssetsEventsModule } from './modules/events/assets/assets-events.module';
import { AttendanceEventsModule } from './modules/events/attendance/attendance-events.module';
import { CalendarEventsModule } from './modules/events/calendar/calendar-events.module';
import { ChatEventsModule } from './modules/events/chat/chat-events.module';
import { CrmEventsModule } from './modules/events/crm/crm-events.module';
import { DocumentsEventsModule } from './modules/events/documents/documents-events.module';
import { MembersEventsModule } from './modules/events/members/members-events.module';
import { ReportsEventsModule } from './modules/events/reports/reports-events.module';
import { SupportEventsModule } from './modules/events/support/support-events.module';
import { TasksEventsModule } from './modules/events/tasks/tasks-events.module';

/**
 * notification-service: push, email, the live connections and the in-app inbox — and one module per
 * area whose events it turns into those (code-structure-fix 4.6). This module only puts them together.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    EmailModule,
    PushModule,
    WebsocketModule,
    InboxModule,
    MemberFactsModule,
    ApprovalsEventsModule,
    AssetsEventsModule,
    AttendanceEventsModule,
    CalendarEventsModule,
    ChatEventsModule,
    CrmEventsModule,
    DocumentsEventsModule,
    MembersEventsModule,
    ReportsEventsModule,
    SupportEventsModule,
    TasksEventsModule,
  ],
  providers: [RetentionService],
})
export class AppModule {}
