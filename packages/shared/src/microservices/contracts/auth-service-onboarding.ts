/** Message contracts for auth-service `onboarding` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

import type { AuthServiceReply } from './auth-service-replies';

export const onboardingCreateOrg = rpc<{
  userId: string;
  name: string;
  address?: string;
  industry?: string;
  firstSpaceName?: string;
}>('onboarding_create_org');
export const onboardingValidateOrgCode = rpc<{ code: string }>('onboarding_validate_org_code');
export const onboardingSubmitJoinRequest = rpc<
  { userId: string; orgCode: string; message?: string },
  AuthServiceReply<{ autoApproved?: boolean }>
>('onboarding_submit_join_request');
export const onboardingAcceptInvitationExisting = rpc<{ userId: string; code: string }>(
  'onboarding_accept_invitation_existing',
);
export const onboardingGetStatus = rpc<{ userId: string }>('onboarding_get_status');
export const onboardingListJoinRequests = rpc<{
  organizationId: string;
  status?: string;
  page?: number;
  limit?: number;
}>('onboarding_list_join_requests');
export const onboardingApproveJoinRequest = rpc<
  {
    requestId: string;
    organizationId: string;
    approverId: string;
    role: string;
    position?: string;
    enabledModules?: string[];
    specialty?: string;
    maxDailyJobs?: number;
  },
  AuthServiceReply<{ userId?: string; organizationName?: string }>
>('onboarding_approve_join_request');
export const onboardingRejectJoinRequest = rpc<
  { requestId: string; organizationId: string; approverId: string; reason?: string },
  AuthServiceReply<{ userId?: string; organizationName?: string }>
>('onboarding_reject_join_request');
export const onboardingCancelJoinRequest = rpc<{ requestId: string; userId: string }>('onboarding_cancel_join_request');
export const onboardingRegenerateJoinCode = rpc<{ organizationId: string }>('onboarding_regenerate_join_code');
export const onboardingGetJoinCode = rpc<{ organizationId: string }>('onboarding_get_join_code');
export const onboardingUpdateJoinPolicy = rpc<{ organizationId: string; joinPolicy: string }>(
  'onboarding_update_join_policy',
);
export const onboardingUpdateLeavePolicy = rpc<{
  organizationId: string;
  policy?: Record<string, unknown>;
  defaultLeaveAllowance?: number;
}>('onboarding_update_leave_policy');
export const updateProfileBadges = rpc<{ organizationId: string; profileBadges: any }>('update_profile_badges');
export const getProfileBadges = rpc<{ organizationId: string }>('get_profile_badges');
export const getOrgProfile = rpc<{ organizationId: string }>('get_org_profile');
export const updateOrgProfile = rpc<{ organizationId: string; updates: any }>('update_org_profile');
export const updateOrgNotificationPrefs = rpc<{ organizationId: string; prefs: any }>('update_org_notification_prefs');
export const updateSecuritySettings = rpc<{ organizationId: string; settings: any }>('update_security_settings');
