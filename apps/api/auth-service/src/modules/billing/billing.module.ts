import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { StripeSyncService } from './stripe-sync.service';
import { StripeSyncController } from './stripe-sync.controller';
import { OrgBillService } from './org-bill.service';
import { BillingTrialService } from './billing-trial.service';
import { SubscriptionService } from './subscription.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { BillingAdminService } from './billing-admin.service';
import { UsageSweepService } from './usage-sweep.service';
import { StripeLinesService } from './stripe-lines.service';
import { StripeCatalogService } from './stripe-catalog.service';

@Module({
  controllers: [BillingController, StripeSyncController],
  providers: [
    BillingService,
    BillingTrialService,
    SubscriptionService,
    StripeWebhookService,
    BillingAdminService,
    UsageSweepService,
    StripeService,
    StripeLinesService,
    StripeCatalogService,
    StripeSyncService,
    OrgBillService,
  ],
  exports: [
    BillingService,
    BillingTrialService,
    SubscriptionService,
    StripeWebhookService,
    BillingAdminService,
    UsageSweepService,
    OrgBillService,
  ],
})
export class BillingModule {}
