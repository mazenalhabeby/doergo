import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
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
import { AppVersionModule } from './modules/app-version/app-version.module';
import { RoutesModule } from './modules/routes/routes.module';
import { PortalModule } from './modules/portal/portal.module';
import { SearchModule } from './modules/search/search.module';
import { JoinRequestsModule } from './modules/join-requests/join-requests.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { BillingModule } from './modules/billing/billing.module';
import { SupportModule } from './modules/support/support.module';
import { ShiftIssuesModule } from './modules/shift-issues/shift-issues.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { BlogModule } from './modules/blog/blog.module';
import { ChatModule } from './modules/chat/chat.module';
import { PhasesModule } from './modules/phases/phases.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { EpicsModule } from './modules/epics/epics.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { RecurringTasksModule } from './modules/recurring-tasks/recurring-tasks.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { SpaceSharingModule } from './modules/space-sharing/space-sharing.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthCacheModule } from './common/cache/auth-cache.module';
import { RolesGuard } from './common/guards/roles.guard';
import { OnboardingCompleteGuard } from './common/guards/onboarding-complete.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AccessModuleGuard } from './common/guards/access-module.guard';
import { ClientPlatformGuard } from './common/guards/client-platform.guard';
import { CustomerConfinementGuard } from './common/guards/customer-confinement.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { PlanGuard } from './common/guards/plan.guard';
import { ModuleGuard } from './common/guards/module.guard';
import { SpaceModulesModule } from './common/space-modules.service';
import { OrgEventsModule } from './common/events/org-events.service';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AppVersionInterceptor } from './common/interceptors/app-version.interceptor';
import { StorageModule } from './common/storage/storage.module';

@Module({
  imports: [
    // Public: what mobile version is still allowed to talk to this API.
    AppVersionModule,
    StorageModule,
    AuthCacheModule,
    // Global: ModuleGuard is an APP_GUARD, so it is constructed in every
    // module's injector and its dependency has to be reachable from all of them.
    SpaceModulesModule,
    OrgEventsModule,
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
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // Counters live in REDIS, shared across replicas. The default in-memory
      // store multiplies every limit below by the replica count — silently,
      // because nothing fails; each replica simply counts only its own traffic.
      // Falls back to per-process counting if Redis is unreachable, which is the
      // behaviour that existed before, rather than taking the API down.
      useFactory: (config: ConfigService) => ({
        storage: new RedisThrottlerStorage(config),
        throttlers: [
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
        ],
      }),
    }),
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
    PlatformAdminModule,
    BlogModule,
    ChatModule,
    PhasesModule,
    SprintsModule,
    EpicsModule,
    WorkflowsModule,
    CustomFieldsModule,
    RecurringTasksModule,
    InvoicesModule,
    DocumentsModule,
    SpaceSharingModule,
    GeoModule,
    RoutesModule,
    PortalModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guards - Throttler → JwtAuthGuard → RolesGuard → OnboardingCompleteGuard → PermissionsGuard → AccessModuleGuard
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
    // Feature tabs from the member's Access Profile. Sits next to PermissionsGuard
    // because it answers the same kind of question — may THIS member use this
    // surface — just from the profile rather than the role.
    {
      provide: APP_GUARD,
      useClass: AccessModuleGuard,
    },
    // Web / Mobile / Both from the same Access Profile.
    {
      provide: APP_GUARD,
      useClass: ClientPlatformGuard,
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
    {
      // Records which build of the app a member is running. Emits and returns;
      // nothing on the request waits for it.
      provide: APP_INTERCEPTOR,
      useClass: AppVersionInterceptor,
    },
  ],
})
export class AppModule {}
