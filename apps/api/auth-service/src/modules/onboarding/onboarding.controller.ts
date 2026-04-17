import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OnboardingService } from './onboarding.service';

@Controller()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @MessagePattern({ cmd: 'onboarding_create_org' })
  async createOrganization(@Payload() data: { userId: string; name: string; address?: string; industry?: string }) {
    return this.onboardingService.createOrganization(data.userId, data);
  }

  @MessagePattern({ cmd: 'onboarding_validate_org_code' })
  async validateOrgCode(@Payload() data: { code: string }) {
    return this.onboardingService.validateOrgCode(data.code);
  }

  @MessagePattern({ cmd: 'onboarding_submit_join_request' })
  async submitJoinRequest(@Payload() data: { userId: string; orgCode: string; message?: string }) {
    return this.onboardingService.submitJoinRequest(data.userId, data);
  }

  @MessagePattern({ cmd: 'onboarding_accept_invitation_existing' })
  async acceptInvitationExisting(@Payload() data: { userId: string; code: string }) {
    return this.onboardingService.acceptInvitationForExistingUser(data.userId, data.code);
  }

  @MessagePattern({ cmd: 'onboarding_get_status' })
  async getStatus(@Payload() data: { userId: string }) {
    return this.onboardingService.getOnboardingStatus(data.userId);
  }

  @MessagePattern({ cmd: 'onboarding_list_join_requests' })
  async listJoinRequests(@Payload() data: any) {
    return this.onboardingService.listJoinRequests(data);
  }

  @MessagePattern({ cmd: 'onboarding_approve_join_request' })
  async approveJoinRequest(@Payload() data: any) {
    return this.onboardingService.approveJoinRequest(data);
  }

  @MessagePattern({ cmd: 'onboarding_reject_join_request' })
  async rejectJoinRequest(@Payload() data: any) {
    return this.onboardingService.rejectJoinRequest(data);
  }

  @MessagePattern({ cmd: 'onboarding_cancel_join_request' })
  async cancelJoinRequest(@Payload() data: { requestId: string; userId: string }) {
    return this.onboardingService.cancelJoinRequest(data.requestId, data.userId);
  }

  @MessagePattern({ cmd: 'onboarding_regenerate_join_code' })
  async regenerateJoinCode(@Payload() data: { organizationId: string }) {
    return this.onboardingService.regenerateJoinCode(data.organizationId);
  }

  @MessagePattern({ cmd: 'onboarding_get_join_code' })
  async getJoinCode(@Payload() data: { organizationId: string }) {
    return this.onboardingService.getJoinCode(data.organizationId);
  }

  @MessagePattern({ cmd: 'onboarding_update_join_policy' })
  async updateJoinPolicy(@Payload() data: { organizationId: string; joinPolicy: string }) {
    return this.onboardingService.updateJoinPolicy(data.organizationId, data.joinPolicy);
  }

  @MessagePattern({ cmd: 'update_profile_badges' })
  async updateProfileBadges(@Payload() data: { organizationId: string; profileBadges: any }) {
    return this.onboardingService.updateProfileBadges(data.organizationId, data.profileBadges);
  }

  @MessagePattern({ cmd: 'get_profile_badges' })
  async getProfileBadges(@Payload() data: { organizationId: string }) {
    return this.onboardingService.getProfileBadges(data.organizationId);
  }

  @MessagePattern({ cmd: 'get_org_profile' })
  async getOrgProfile(@Payload() data: { organizationId: string }) {
    return this.onboardingService.getOrgProfile(data.organizationId);
  }

  @MessagePattern({ cmd: 'update_org_profile' })
  async updateOrgProfile(@Payload() data: { organizationId: string; updates: any }) {
    return this.onboardingService.updateOrgProfile(data.organizationId, data.updates);
  }

  @MessagePattern({ cmd: 'update_notification_prefs' })
  async updateNotificationPrefs(@Payload() data: { organizationId: string; prefs: any }) {
    return this.onboardingService.updateNotificationPrefs(data.organizationId, data.prefs);
  }

  @MessagePattern({ cmd: 'update_security_settings' })
  async updateSecuritySettings(@Payload() data: { organizationId: string; settings: any }) {
    return this.onboardingService.updateSecuritySettings(data.organizationId, data.settings);
  }
}
