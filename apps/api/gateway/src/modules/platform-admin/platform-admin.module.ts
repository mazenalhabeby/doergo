import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformPricingController } from './platform-pricing.controller';
import { PlatformSupportController } from './platform-support.controller';
import { PlatformSupportTeamsController } from './platform-support-teams.controller';
import { PlatformSupportTeamsService } from './platform-support-teams.service';
import { PlatformLibraryController } from './platform-library.controller';
import { PlatformLibraryService } from './platform-library.service';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformSupportService } from './platform-support.service';

// The SERVICE_NAMES.AUTH + SERVICE_NAMES.TASK ClientProxies are provided globally.
@Module({
  controllers: [
    PlatformAdminController,
    PlatformAuthController,
    PlatformPricingController,
    PlatformSupportController,
    PlatformSupportTeamsController,
    PlatformLibraryController,
  ],
  providers: [PlatformAdminService, PlatformSupportService, PlatformSupportTeamsService, PlatformLibraryService],
})
export class PlatformAdminModule {}
