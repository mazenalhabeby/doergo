import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { StripeSyncService } from './stripe-sync.service';
import { StripeSyncController } from './stripe-sync.controller';
import { OrgBillService } from './org-bill.service';

@Module({
  controllers: [BillingController, StripeSyncController],
  providers: [BillingService, StripeService, StripeSyncService, OrgBillService],
  exports: [BillingService, OrgBillService],
})
export class BillingModule {}
