import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformPricingController } from './platform-pricing.controller';
import { PlatformAdminService } from './platform-admin.service';

// The SERVICE_NAMES.AUTH ClientProxy is provided globally (MicroservicesModule).
@Module({
  controllers: [PlatformAdminController, PlatformAuthController, PlatformPricingController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}
