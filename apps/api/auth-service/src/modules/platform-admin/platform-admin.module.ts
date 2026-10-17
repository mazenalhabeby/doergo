import { SessionEventsModule } from '../../common/session-events/session-events.module';
import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformPricingController } from './platform-pricing.controller';
import { PricingService } from './platform-pricing.service';
import { PlatformSupportTeamsController } from './platform-support-teams.controller';
import { PlatformSupportTeamsService } from './platform-support-teams.service';
// The billing mode moves a live subscription's collection method.
import { StripeService } from '../billing/stripe.service';
/*
  An agreed price is a billing decision, so it reuses the billing engine rather
  than growing a second one here: OrgBillService to read the list price it is
  being agreed against, BillingService to push the new amount to Stripe at once.
  Imported as a MODULE — instantiating those providers again would give this
  console its own copies with their own state.
*/
import { BillingModule } from '../billing/billing.module';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformBillingAlertsService } from './platform-billing-alerts.service';
import { PlatformTrialService } from './platform-trial.service';
import { PlatformTwoFactorService } from './platform-two-factor.service';
import { PlatformStaffService } from './platform-staff.service';

// PrismaService (global PrismaModule) + JwtService (global JwtModule) are available.
@Module({
  imports: [SessionEventsModule, BillingModule],
  controllers: [
    PlatformAdminController,
    PlatformAuthController,
    PlatformPricingController,
    PlatformSupportTeamsController,
  ],
  providers: [
    PlatformAdminService,
    PlatformBillingService,
    PlatformBillingAlertsService,
    PlatformTrialService,
    PlatformAuthService,
    PlatformTwoFactorService,
    PlatformStaffService,
    PlatformAuditService,
    PricingService,
    PlatformSupportTeamsService,
    StripeService,
  ],
  exports: [
    PlatformAdminService,
    PlatformAuthService,
    PlatformAuditService,
    PricingService,
    PlatformSupportTeamsService,
  ],
})
export class PlatformAdminModule {}
