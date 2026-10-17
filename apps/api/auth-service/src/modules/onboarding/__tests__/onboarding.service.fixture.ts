import { combinedServices } from '../../../common/testing/combined-services';
import { OnboardingService } from '../onboarding.service';
import { InvitationOnboardingService } from '../invitation-onboarding.service';
import { JoinRequestService } from '../join-request.service';
import { JoinRequestReviewService } from '../join-request-review.service';
import { OrgSettingsService } from '../org-settings.service';
import { OrgProfileService } from '../org-profile.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of OnboardingService, as ONE object — the tests were written against the single class. */
export type OnboardingServiceParts = Public<OnboardingService> &
  Public<InvitationOnboardingService> &
  Public<JoinRequestService> &
  Public<JoinRequestReviewService> &
  Public<OrgSettingsService> &
  Public<OrgProfileService>;

export function onboardingServices(...args: unknown[]): OnboardingServiceParts {
  return combinedServices<OnboardingServiceParts>(
    new (OnboardingService as unknown as new (...a: unknown[]) => object)(...args),
    new (InvitationOnboardingService as unknown as new (...a: unknown[]) => object)(...args),
    new (JoinRequestService as unknown as new (...a: unknown[]) => object)(...args),
    new (JoinRequestReviewService as unknown as new (...a: unknown[]) => object)(...args),
    new (OrgSettingsService as unknown as new (...a: unknown[]) => object)(...args),
    new (OrgProfileService as unknown as new (...a: unknown[]) => object)(...args),
  );
}
