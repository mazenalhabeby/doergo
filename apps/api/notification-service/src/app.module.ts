import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@hbcfield/shared';
import { EmailModule } from './modules/email/email.module';
import { PushModule } from './modules/push/push.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { NotificationController } from './notification.controller';
import { TaskNotificationHandler } from './handlers/task-notification.handler';
import { AttendanceNotificationHandler } from './handlers/attendance-notification.handler';
import { JoinRequestNotificationHandler } from './handlers/join-request-notification.handler';
import { SupportNotificationHandler } from './handlers/support-notification.handler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
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
  ],
})
export class AppModule {}
