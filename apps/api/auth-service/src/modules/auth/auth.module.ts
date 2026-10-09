import { MemberOffboardingModule } from '../../common/member-offboarding/member-offboarding.module';
import { SessionEventsModule } from '../../common/session-events/session-events.module';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_SERVICES } from './auth-services';
import { BiometricService } from './biometric.service';
import { BiometricChallengeStore } from './biometric-challenge.store';
import { GraceTokenCache } from './grace-token-cache.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [SessionEventsModule, MemberOffboardingModule, AuditLogModule, BillingModule],
  controllers: [AuthController],
  // The facade and its collaborators — see auth-services.ts.
  providers: [...AUTH_SERVICES, GraceTokenCache, BiometricService, BiometricChallengeStore],
  exports: [AuthService],
})
export class AuthModule {}
