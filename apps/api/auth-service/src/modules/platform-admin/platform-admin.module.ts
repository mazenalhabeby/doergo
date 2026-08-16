import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformPricingController } from './platform-pricing.controller';
import { PricingService } from './platform-pricing.service';

// PrismaService (global PrismaModule) + JwtService (global JwtModule) are available.
@Module({
  controllers: [PlatformAdminController, PlatformAuthController, PlatformPricingController],
  providers: [PlatformAdminService, PlatformAuthService, PricingService],
  exports: [PlatformAdminService, PlatformAuthService, PricingService],
})
export class PlatformAdminModule {}
