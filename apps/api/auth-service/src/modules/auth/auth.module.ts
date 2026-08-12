import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GraceTokenCache } from './grace-token-cache.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AuditLogModule, BillingModule],
  controllers: [AuthController],
  providers: [AuthService, GraceTokenCache],
  exports: [AuthService],
})
export class AuthModule {}
