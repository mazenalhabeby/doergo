import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InvitationModule } from './modules/invitations/invitation.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { InvoiceModule } from './modules/invoices/invoice.module';
import { SpaceSharingModule } from './modules/space-sharing/space-sharing.module';
import { BillingModule } from './modules/billing/billing.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { BlogModule } from './modules/blog/blog.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SearchModule } from './modules/search/search.module';
import { PortalModule } from './modules/portal/portal.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    // SECURITY: Use async registration to ensure JWT_ACCESS_SECRET is configured
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_ACCESS_SECRET');
        if (!secret) {
          throw new Error(
            'CRITICAL: JWT_ACCESS_SECRET environment variable is not set. ' +
            'Generate a strong secret (minimum 32 characters) and set it in your .env file.',
          );
        }
        // SECURITY: Ensure minimum secret length for security
        if (secret.length < 32) {
          throw new Error(
            'CRITICAL: JWT_ACCESS_SECRET must be at least 32 characters long. ' +
            'Use a cryptographically secure random string.',
          );
        }
        // SECURITY (H8): Fail fast if the REFRESH secret is missing or weak.
        // Refresh tokens are signed with JWT_REFRESH_SECRET at the call site, but
        // JwtService silently falls back to the module default (this access secret)
        // when the per-call secret resolves to undefined — so an unset refresh
        // secret would quietly sign refresh tokens with the ACCESS secret,
        // collapsing the two-key separation. Validate it here so boot aborts
        // instead of running in that degraded state. (Verification stays a
        // SHA-256 DB-hash lookup — no jwtService.verify on refresh — to avoid
        // mass-logout of tokens issued before this guard existed.)
        const refreshSecret = configService.get<string>('JWT_REFRESH_SECRET');
        if (!refreshSecret) {
          throw new Error(
            'CRITICAL: JWT_REFRESH_SECRET environment variable is not set. ' +
            'Set a strong secret (minimum 32 characters), distinct from JWT_ACCESS_SECRET.',
          );
        }
        if (refreshSecret.length < 32) {
          throw new Error(
            'CRITICAL: JWT_REFRESH_SECRET must be at least 32 characters long.',
          );
        }
        if (refreshSecret === secret) {
          throw new Error(
            'CRITICAL: JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET.',
          );
        }
        return {
          secret,
          // Pin HS256 on both sign and verify so tokens can't be minted/accepted
          // under a different algorithm (none-alg / algorithm-confusion) (L10).
          signOptions: { expiresIn: configService.get('JWT_ACCESS_EXPIRATION', '15m'), algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    InvitationModule,
    OnboardingModule,
    AuditLogModule,
    InvoiceModule,
    SpaceSharingModule,
    BillingModule,
    PlatformAdminModule,
    BlogModule,
    CustomersModule,
    SearchModule,
    PortalModule,
  ],
})
export class AppModule {}
