import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { BillingModule } from '../billing/billing.module';
import { InvitationOnboardingService } from './invitation-onboarding.service';
import { JoinRequestService } from './join-request.service';
import { JoinRequestReviewService } from './join-request-review.service';
import { OrgSettingsService } from './org-settings.service';
import { OrgProfileService } from './org-profile.service';

@Module({
  imports: [
    BillingModule,
    // Outbound client so join-request submits can alert admins + managers.
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    InvitationOnboardingService,
    JoinRequestService,
    JoinRequestReviewService,
    OrgSettingsService,
    OrgProfileService,
  ],
  exports: [
    OnboardingService,
    InvitationOnboardingService,
    JoinRequestService,
    JoinRequestReviewService,
    OrgSettingsService,
    OrgProfileService,
  ],
})
export class OnboardingModule {}
