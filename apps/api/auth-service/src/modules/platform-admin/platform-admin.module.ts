import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';

// PrismaService (global PrismaModule) + JwtService (global JwtModule) are available.
@Module({
  controllers: [PlatformAdminController, PlatformAuthController],
  providers: [PlatformAdminService, PlatformAuthService],
  exports: [PlatformAdminService, PlatformAuthService],
})
export class PlatformAdminModule {}
