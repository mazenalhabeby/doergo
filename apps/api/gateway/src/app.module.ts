import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { createBullMQConfig } from '@doergo/shared';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MicroservicesModule } from './common/microservices/microservices.module';
import { AuthModule } from './modules/auth/auth.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { AssetsModule } from './modules/assets/assets.module';
import { ReportsModule } from './modules/reports/reports.module';
import { LocationsModule } from './modules/locations/locations.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { TechniciansModule } from './modules/technicians/technicians.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Rate limiting: 10 requests per 60 seconds per IP
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 3, // 3 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 20, // 20 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    // BullMQ for reliable job processing
    BullModule.forRootAsync(createBullMQConfig()),
    // Bull Board for job monitoring (available at /admin/queues)
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    MicroservicesModule,
    AuthModule,
    TasksModule,
    UsersModule,
    TrackingModule,
    AssetsModule,
    ReportsModule,
    LocationsModule,
    AttendanceModule,
    TechniciansModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guards - Throttler runs first, then JwtAuthGuard, then RolesGuard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
