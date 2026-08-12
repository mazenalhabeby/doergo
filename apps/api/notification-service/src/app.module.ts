import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@hbcfield/shared';
import { RetentionService } from './common/retention/retention.service';
import { EmailModule } from './modules/email/email.module';
import { PushModule } from './modules/push/push.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { NotificationController } from './notification.controller';
import { TaskNotificationHandler } from './handlers/task-notification.handler';
import { AttendanceNotificationHandler } from './handlers/attendance-notification.handler';
import { JoinRequestNotificationHandler } from './handlers/join-request-notification.handler';
import { SupportNotificationHandler } from './handlers/support-notification.handler';
import { ChatNotificationHandler } from './handlers/chat-notification.handler';
import { ReportNotificationHandler } from './handlers/report-notification.handler';
import { NotificationStore } from './common/notification-store.service';

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
  ],
  controllers: [
    NotificationController,
    TaskNotificationHandler,
    AttendanceNotificationHandler,
    JoinRequestNotificationHandler,
    SupportNotificationHandler,
    ChatNotificationHandler,
    ReportNotificationHandler,
  ],
  providers: [NotificationStore, RetentionService],
})
export class AppModule {}
