import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@doergo/shared';
import { PrismaModule } from './common/prisma/prisma.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CommentsModule } from './modules/comments/comments.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Client for notification service (to emit events)
    ClientsModule.registerAsync([
      createClientOptions(SERVICE_NAMES.NOTIFICATION),
    ]),
    PrismaModule,
    TasksModule,
    CommentsModule,
    AttachmentsModule,
  ],
})
export class AppModule {}
