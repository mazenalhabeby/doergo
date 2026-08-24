import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

// The SERVICE_NAMES.TASK ClientProxy is provided globally (MicroservicesModule).
@Module({
  controllers: [SupportController],
  providers: [PlatformAdminGuard, SupportService],
})
export class SupportModule {}
