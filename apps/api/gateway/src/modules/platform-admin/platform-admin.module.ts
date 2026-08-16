import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformPricingController } from './platform-pricing.controller';
import { PlatformSupportController } from './platform-support.controller';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformSupportService } from './platform-support.service';

// The SERVICE_NAMES.AUTH + SERVICE_NAMES.TASK ClientProxies are provided globally.
@Module({
  controllers: [PlatformAdminController, PlatformAuthController, PlatformPricingController, PlatformSupportController],
  providers: [PlatformAdminService, PlatformSupportService],
})
export class PlatformAdminModule {}
