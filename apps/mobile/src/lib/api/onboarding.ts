import { call, E } from './client';
import type { User, LoginResponse, InvitationValidation, AcceptInvitationInput } from './types';

// Onboarding API - post-registration onboarding flow
export const onboardingApi = {
  getStatus: async (): Promise<{ needsOnboarding: boolean; hasPendingJoinRequest: boolean; pendingRequest: any }> => {
    return call(E.onboarding.status);
  },

  createOrganization: async (data: { name: string; address?: string; industry?: string; firstSpaceName?: string }): Promise<{ organization: { id: string; name: string }; joinCode: string; user: User }> => {
    return call(E.onboarding.createOrg, undefined, { body: data });
  },

  validateOrgCode: async (code: string): Promise<{ valid: boolean; organizationName?: string; joinPolicy?: string; message?: string }> => {
    return call(E.onboarding.validateOrgCode, { code });
  },

  submitJoinRequest: async (data: { orgCode: string; message?: string }): Promise<any> => {
    return call(E.onboarding.joinByCode, undefined, { body: data });
  },

  acceptInvitation: async (code: string): Promise<{ user: User }> => {
    return call(E.onboarding.acceptInvitation, undefined, { body: { code } });
  },

  cancelJoinRequest: async (id: string): Promise<any> => {
    return call(E.onboarding.cancelJoinRequest, { id });
  },
};

// Invitations API - invite code registration flow (public endpoints)
export const invitationsApi = {
  validate: async (code: string): Promise<InvitationValidation> => {
    return call(E.invitations.validate, { code });
  },

  accept: async (input: AcceptInvitationInput): Promise<LoginResponse> => {
    return call(E.invitations.accept, undefined, { body: input });
  },
};

// Push Token API
export const pushApi = {
  registerToken: async (input: { token: string; platform: 'ios' | 'android' | 'web'; deviceId?: string; locale?: string }): Promise<{ success: boolean }> => {
    return call(E.users.registerPushToken, undefined, { body: input });
  },

  removeToken: async (token: string): Promise<{ success: boolean }> => {
    return call(E.users.removePushToken, { token });
  },
};
