import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { createBullMQConfig } from '@hbcfield/shared';
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
import { OvertimeModule } from './modules/overtime/overtime.module';
import { EmployeesModule } from './modules/technicians/technicians.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { JoinRequestsModule } from './modules/join-requests/join-requests.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PhasesModule } from './modules/phases/phases.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { EpicsModule } from './modules/epics/epics.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { RecurringTasksModule } from './modules/recurring-tasks/recurring-tasks.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthCacheModule } from './common/cache/auth-cache.module';
import { RolesGuard } from './common/guards/roles.guard';
import { OnboardingCompleteGuard } from './common/guards/onboarding-complete.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    AuthCacheModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Rate limiting: 10 requests per 60 seconds per IP
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 10, // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 50, // 50 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 200, // 200 requests per minute
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
    OvertimeModule,
    EmployeesModule,
    InvitationsModule,
    OnboardingModule,
    JoinRequestsModule,
    OrganizationsModule,
    PhasesModule,
    SprintsModule,
    EpicsModule,
    WorkflowsModule,
    CustomFieldsModule,
    RecurringTasksModule,
    InvoicesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guards - Throttler → JwtAuthGuard → RolesGuard → OnboardingCompleteGuard → PermissionsGuard
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
    {
      provide: APP_GUARD,
      useClass: OnboardingCompleteGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    // Auto-audit every mutating request (after guards, around the handler).
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
