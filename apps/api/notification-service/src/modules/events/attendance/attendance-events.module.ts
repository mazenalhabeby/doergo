import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module';
import { InboxModule } from '../../inbox/inbox.module';
import { PushModule } from '../../push/push.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { DayDecidedHandler } from './day-decided.handler';
import { AttendanceNotificationHandler } from './attendance-notification.handler';
import { TimeOffNotificationHandler } from './time-off-notification.handler';
import { ShiftIssueNotificationHandler } from './shift-issue-notification.handler';
import { AttendanceLiveHandler } from './attendance-live.handler';
import { AttendanceAlertsHandler } from './attendance-alerts.handler';
import { NoShowNotificationHandler } from './no-show-notification.handler';
import { BreakNotificationHandler } from './break-notification.handler';
import { ExcursionNotificationHandler } from './excursion-notification.handler';
import { OvertimeNotificationHandler } from './overtime-notification.handler';

/** Clocking in and out: shifts, rests, no-shows, alerts, overtime and extra time, shift issues, leave. */
@Module({
  imports: [EmailModule, InboxModule, PushModule, WebsocketModule],
  controllers: [
    DayDecidedHandler,
    AttendanceNotificationHandler,
    TimeOffNotificationHandler,
    ShiftIssueNotificationHandler,
    AttendanceLiveHandler,
    AttendanceAlertsHandler,
    NoShowNotificationHandler,
    BreakNotificationHandler,
    ExcursionNotificationHandler,
    OvertimeNotificationHandler,
  ],
})
export class AttendanceEventsModule {}
