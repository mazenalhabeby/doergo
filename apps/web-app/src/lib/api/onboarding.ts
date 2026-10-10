import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { OnboardingStatusResult } from './types/onboarding';
import { onboardingEndpoints, type OrgCodeValidation } from '@hbcfield/shared/client';

// ============================================================================
// ONBOARDING API — post-registration flow for orphan users (no org yet).
// Mirrors the mobile onboarding flow: create org / join by code / accept invite.
// All endpoints require auth but SKIP the onboarding guard (SkipOnboardingCheck).
// ============================================================================

/** Unwrap the gateway `{ success, data }` envelope, tolerating raw responses. */
export function unwrap<T>(body: unknown): T {
  const b = body as { data?: T } | T;
  return ((b as { data?: T })?.data ?? b) as T;
}


export const onboardingApi = {
  getStatus: async (): Promise<OnboardingStatusResult> => {
    const response = await call(onboardingEndpoints.status) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return unwrap<OnboardingStatusResult>(response.data);
  },

  createOrganization: async (data: {
    name: string;
    address?: string;
    industry?: string;
    firstSpaceName?: string;
  }): Promise<{ organization: { id: string; name: string }; joinCode?: string }> => {
    const response = await call(onboardingEndpoints.createOrg, undefined, { body: data }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return unwrap(response.data);
  },

  validateOrgCode: async (code: string): Promise<OrgCodeValidation> => {
    const response = await call(onboardingEndpoints.validateOrgCode, { code }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return unwrap<OrgCodeValidation>(response.data);
  },

  submitJoinRequest: async (data: {
    orgCode: string;
    message?: string;
  }): Promise<{ autoApproved?: boolean; joinRequest?: { id: string } }> => {
    const response = await call(onboardingEndpoints.joinByCode, undefined, { body: data }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return unwrap(response.data);
  },

  acceptInvitation: async (code: string): Promise<unknown> => {
    const response = await call(onboardingEndpoints.acceptInvitation, undefined, { body: { code } }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return unwrap(response.data);
  },

  cancelJoinRequest: async (id: string): Promise<unknown> => {
    const response = await call(onboardingEndpoints.cancelJoinRequest, { id }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return unwrap(response.data);
  },
};
