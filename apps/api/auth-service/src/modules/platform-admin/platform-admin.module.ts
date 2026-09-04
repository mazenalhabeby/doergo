import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformPricingController } from './platform-pricing.controller';
import { PricingService } from './platform-pricing.service';
import { PlatformSupportTeamsController } from './platform-support-teams.controller';
import { PlatformSupportTeamsService } from './platform-support-teams.service';
// The billing mode moves a live subscription's collection method.
import { StripeService } from '../billing/stripe.service';

// PrismaService (global PrismaModule) + JwtService (global JwtModule) are available.
@Module({
  controllers: [PlatformAdminController, PlatformAuthController, PlatformPricingController, PlatformSupportTeamsController],
  providers: [PlatformAdminService, PlatformAuthService, PricingService, PlatformSupportTeamsService, StripeService],
  exports: [PlatformAdminService, PlatformAuthService, PricingService, PlatformSupportTeamsService],
})
export class PlatformAdminModule {}
