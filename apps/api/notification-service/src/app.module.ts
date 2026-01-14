import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from './modules/email/email.module';
import { PushModule } from './modules/push/push.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { NotificationController } from './notification.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EmailModule,
    PushModule,
    WebsocketModule,
  ],
  controllers: [NotificationController],
})
export class AppModule {}
