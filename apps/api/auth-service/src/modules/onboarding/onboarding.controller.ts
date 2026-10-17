import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OnboardingService } from './onboarding.service';
import { InvitationOnboardingService } from './invitation-onboarding.service';
import { JoinRequestService } from './join-request.service';
import { JoinRequestReviewService } from './join-request-review.service';
import { OrgSettingsService } from './org-settings.service';
import { OrgProfileService } from './org-profile.service';

import {
  pattern,
  onboardingCreateOrg,
  onboardingValidateOrgCode,
  onboardingSubmitJoinRequest,
  onboardingAcceptInvitationExisting,
  onboardingGetStatus,
  onboardingListJoinRequests,
  onboardingApproveJoinRequest,
  onboardingRejectJoinRequest,
  onboardingCancelJoinRequest,
  onboardingRegenerateJoinCode,
  onboardingGetJoinCode,
  onboardingUpdateJoinPolicy,
  onboardingUpdateLeavePolicy,
  updateProfileBadges,
  getProfileBadges,
  getOrgProfile,
  updateOrgProfile,
  updateOrgNotificationPrefs,
  updateSecuritySettings,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly orgProfile: OrgProfileService,
    private readonly orgSettings: OrgSettingsService,
    private readonly joinReview: JoinRequestReviewService,
    private readonly joinRequests: JoinRequestService,
    private readonly invitationOnboarding: InvitationOnboardingService,
  ) {}

  @MessagePattern(pattern(onboardingCreateOrg))
  async createOrganization(@Payload() data: RpcRequest<typeof onboardingCreateOrg>) {
    return this.onboardingService.createOrganization(data.userId, data);
  }

  @MessagePattern(pattern(onboardingValidateOrgCode))
  async validateOrgCode(@Payload() data: RpcRequest<typeof onboardingValidateOrgCode>) {
    return this.onboardingService.validateOrgCode(data.code);
  }

  @MessagePattern(pattern(onboardingSubmitJoinRequest))
  async submitJoinRequest(@Payload() data: RpcRequest<typeof onboardingSubmitJoinRequest>) {
    return this.joinRequests.submitJoinRequest(data.userId, data);
  }

  @MessagePattern(pattern(onboardingAcceptInvitationExisting))
  async acceptInvitationExisting(@Payload() data: RpcRequest<typeof onboardingAcceptInvitationExisting>) {
    return this.invitationOnboarding.acceptInvitationForExistingUser(data.userId, data.code);
  }

  @MessagePattern(pattern(onboardingGetStatus))
  async getStatus(@Payload() data: RpcRequest<typeof onboardingGetStatus>) {
    return this.onboardingService.getOnboardingStatus(data.userId);
  }

  @MessagePattern(pattern(onboardingListJoinRequests))
  async listJoinRequests(@Payload() data: RpcRequest<typeof onboardingListJoinRequests>) {
    return this.joinReview.listJoinRequests(data);
  }

  @MessagePattern(pattern(onboardingApproveJoinRequest))
  async approveJoinRequest(@Payload() data: RpcRequest<typeof onboardingApproveJoinRequest>) {
    return this.joinReview.approveJoinRequest(data);
  }

  @MessagePattern(pattern(onboardingRejectJoinRequest))
  async rejectJoinRequest(@Payload() data: RpcRequest<typeof onboardingRejectJoinRequest>) {
    return this.joinReview.rejectJoinRequest(data);
  }

  @MessagePattern(pattern(onboardingCancelJoinRequest))
  async cancelJoinRequest(@Payload() data: RpcRequest<typeof onboardingCancelJoinRequest>) {
    return this.joinRequests.cancelJoinRequest(data.requestId, data.userId);
  }

  @MessagePattern(pattern(onboardingRegenerateJoinCode))
  async regenerateJoinCode(@Payload() data: RpcRequest<typeof onboardingRegenerateJoinCode>) {
    return this.orgSettings.regenerateJoinCode(data.organizationId);
  }

  @MessagePattern(pattern(onboardingGetJoinCode))
  async getJoinCode(@Payload() data: RpcRequest<typeof onboardingGetJoinCode>) {
    return this.orgSettings.getJoinCode(data.organizationId);
  }

  @MessagePattern(pattern(onboardingUpdateJoinPolicy))
  async updateJoinPolicy(@Payload() data: RpcRequest<typeof onboardingUpdateJoinPolicy>) {
    return this.orgSettings.updateJoinPolicy(data.organizationId, data.joinPolicy);
  }

  @MessagePattern(pattern(onboardingUpdateLeavePolicy))
  async updateLeavePolicy(@Payload() data: RpcRequest<typeof onboardingUpdateLeavePolicy>) {
    // `policy` from the current gateway; the flat allowance from one deployed before it.
    return this.orgSettings.updateLeavePolicy(
      data.organizationId,
      data.policy ?? { defaultLeaveAllowance: data.defaultLeaveAllowance },
    );
  }

  @MessagePattern(pattern(updateProfileBadges))
  async updateProfileBadges(@Payload() data: RpcRequest<typeof updateProfileBadges>) {
    return this.orgSettings.updateProfileBadges(data.organizationId, data.profileBadges);
  }

  @MessagePattern(pattern(getProfileBadges))
  async getProfileBadges(@Payload() data: RpcRequest<typeof getProfileBadges>) {
    return this.orgSettings.getProfileBadges(data.organizationId);
  }

  @MessagePattern(pattern(getOrgProfile))
  async getOrgProfile(@Payload() data: RpcRequest<typeof getOrgProfile>) {
    return this.orgProfile.getOrgProfile(data.organizationId);
  }

  @MessagePattern(pattern(updateOrgProfile))
  async updateOrgProfile(@Payload() data: RpcRequest<typeof updateOrgProfile>) {
    return this.orgProfile.updateOrgProfile(data.organizationId, data.updates);
  }

  // Not `update_notification_prefs`: that name was shared with the member's own
  // settings, and the later registration silently took both (see UsersController).
  @MessagePattern(pattern(updateOrgNotificationPrefs))
  async updateNotificationPrefs(@Payload() data: RpcRequest<typeof updateOrgNotificationPrefs>) {
    return this.orgSettings.updateNotificationPrefs(data.organizationId, data.prefs);
  }

  @MessagePattern(pattern(updateSecuritySettings))
  async updateSecuritySettings(@Payload() data: RpcRequest<typeof updateSecuritySettings>) {
    return this.orgSettings.updateSecuritySettings(data.organizationId, data.settings);
  }
}
