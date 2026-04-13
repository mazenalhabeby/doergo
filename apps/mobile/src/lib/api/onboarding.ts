import { fetchApi, fetchWithAuth } from './client';
import type { User, LoginResponse, InvitationValidation, AcceptInvitationInput } from './types';

// Onboarding API - post-registration onboarding flow
export const onboardingApi = {
  getStatus: async (): Promise<{ needsOnboarding: boolean; hasPendingJoinRequest: boolean; pendingRequest: any }> => {
    return fetchWithAuth<{ needsOnboarding: boolean; hasPendingJoinRequest: boolean; pendingRequest: any }>('/onboarding/status');
  },

  createOrganization: async (data: { name: string; address?: string; industry?: string }): Promise<{ organization: { id: string; name: string }; joinCode: string; user: User }> => {
    return fetchWithAuth<any>('/onboarding/create-org', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  validateOrgCode: async (code: string): Promise<{ valid: boolean; organizationName?: string; joinPolicy?: string; message?: string }> => {
    return fetchWithAuth<any>(`/onboarding/validate-org-code/${encodeURIComponent(code)}`);
  },

  submitJoinRequest: async (data: { orgCode: string; message?: string }): Promise<any> => {
    return fetchWithAuth<any>('/onboarding/join-by-code', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  acceptInvitation: async (code: string): Promise<{ user: User }> => {
    return fetchWithAuth<{ user: User }>('/onboarding/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  cancelJoinRequest: async (id: string): Promise<any> => {
    return fetchWithAuth<any>(`/onboarding/join-requests/${id}`, {
      method: 'DELETE',
    });
  },
};

// Invitations API - invite code registration flow (public endpoints)
export const invitationsApi = {
  validate: async (code: string): Promise<InvitationValidation> => {
    return fetchApi<InvitationValidation>(`/invitations/validate/${encodeURIComponent(code)}`);
  },

  accept: async (input: AcceptInvitationInput): Promise<LoginResponse> => {
    return fetchApi<LoginResponse>('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

// Push Token API
export const pushApi = {
  registerToken: async (input: { token: string; platform: 'ios' | 'android' | 'web'; deviceId?: string }): Promise<{ success: boolean }> => {
    return fetchWithAuth<{ success: boolean }>('/users/push-token', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  removeToken: async (token: string): Promise<{ success: boolean }> => {
    return fetchWithAuth<{ success: boolean }>(`/users/push-token/${encodeURIComponent(token)}`, {
      method: 'DELETE',
    });
  },
};
