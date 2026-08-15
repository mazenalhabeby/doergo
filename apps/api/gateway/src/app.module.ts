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
import { SpaceRolesModule } from './modules/space-roles/space-roles.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { OvertimeModule } from './modules/overtime/overtime.module';
import { EmployeesModule } from './modules/technicians/technicians.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { CustomersModule } from './modules/customers/customers.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { GeoModule } from './modules/geo/geo.module';
import { RoutesModule } from './modules/routes/routes.module';
import { PortalModule } from './modules/portal/portal.module';
import { SearchModule } from './modules/search/search.module';
import { JoinRequestsModule } from './modules/join-requests/join-requests.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { BillingModule } from './modules/billing/billing.module';
import { SupportModule } from './modules/support/support.module';
import { ShiftIssuesModule } from './modules/shift-issues/shift-issues.module';
import { ChatModule } from './modules/chat/chat.module';
import { PhasesModule } from './modules/phases/phases.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { EpicsModule } from './modules/epics/epics.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { RecurringTasksModule } from './modules/recurring-tasks/recurring-tasks.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { SpaceSharingModule } from './modules/space-sharing/space-sharing.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthCacheModule } from './common/cache/auth-cache.module';
import { RolesGuard } from './common/guards/roles.guard';
import { OnboardingCompleteGuard } from './common/guards/onboarding-complete.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { CustomerConfinementGuard } from './common/guards/customer-confinement.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { PlanGuard } from './common/guards/plan.guard';
import { ModuleGuard } from './common/guards/module.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    AuthCacheModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Rate limiting. The three global tiers below always apply per IP. The
    // FOURTH throttler MUST be named 'default': every per-route @Throttle()
    // decorator writes its override under the 'default' key, and @nestjs/throttler
    // only reads an override for a throttler whose name matches. Without a
    // throttler literally named 'default', all @Throttle overrides (login 5/min,
    // forgot/reset-password, invitation validate/accept, operator endpoints) are
    // silently ignored and fall back to the 200/min 'long' tier. Its base limit
    // here matches 'long' so undecorated routes are unaffected; decorated routes
    // tighten it to their own value.
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
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 200, // fallback for undecorated routes; @Throttle() overrides this
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
    SpaceRolesModule,
    ShiftsModule,
    OvertimeModule,
    EmployeesModule,
    InvitationsModule,
    CustomersModule,
    AnalyticsModule,
    OnboardingModule,
    JoinRequestsModule,
    OrganizationsModule,
    BillingModule,
    SupportModule,
    ShiftIssuesModule,
    ChatModule,
    PhasesModule,
    SprintsModule,
    EpicsModule,
    WorkflowsModule,
    CustomFieldsModule,
    RecurringTasksModule,
    InvoicesModule,
    SpaceSharingModule,
    GeoModule,
    RoutesModule,
    PortalModule,
    SearchModule,
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
    // Default-DENY for external CUSTOMER accounts: confines them to @Public,
    // @AllowCustomer, and the portal. Must run right after auth (needs req.user).
    {
      provide: APP_GUARD,
      useClass: CustomerConfinementGuard,
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
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PlanGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ModuleGuard,
    },
    // Auto-audit every mutating request (after guards, around the handler).
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
