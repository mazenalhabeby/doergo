import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@Module({
  controllers: [BillingController],
  // Injected into the controller for its mid-handler secret check (audit B-B1).
  providers: [PlatformAdminGuard],
})
export class BillingModule {}
