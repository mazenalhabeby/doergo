import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import {
  SERVICE_NAMES,
  createClientOptions,
  createBullMQConfig,
  QUEUE_NAMES,
} from '@doergo/shared';
import { PrismaModule } from './common/prisma/prisma.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CommentsModule } from './modules/comments/comments.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AssetsModule } from './modules/assets/assets.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // BullMQ for job processing
    BullModule.forRootAsync(createBullMQConfig()),
    BullModule.registerQueue({
      name: QUEUE_NAMES.TASKS,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.ASSETS,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.REPORTS,
    }),
    // Client for notification service (to emit events)
    ClientsModule.registerAsync([
      createClientOptions(SERVICE_NAMES.NOTIFICATION),
    ]),
    PrismaModule,
    TasksModule,
    CommentsModule,
    AttachmentsModule,
    AssetsModule,
    ReportsModule,
  ],
})
export class AppModule {}
