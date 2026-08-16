import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { StripeSyncService } from './stripe-sync.service';
import { StripeSyncController } from './stripe-sync.controller';

@Module({
  controllers: [BillingController, StripeSyncController],
  providers: [BillingService, StripeService, StripeSyncService],
  exports: [BillingService],
})
export class BillingModule {}
