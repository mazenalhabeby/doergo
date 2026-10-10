import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { invitationsEndpoints, type CreateInvitationInput, type Invitation, type InvitationValidation } from '@hbcfield/shared/client';

// ============================================================================
// INVITATIONS API
// ============================================================================

export const invitationsApi = {
  // Create a new invitation (ADMIN/DISPATCHER)
  // API returns { success, data: { code, ...invitation } } — the plaintext code
  // is only present here, at creation time. Unwrap so callers get `code` flat.
  create: async (input: CreateInvitationInput) => {
    const response = await call(invitationsEndpoints.create, undefined, { body: input }) as ApiResponse<{
      success: boolean;
      data: { code: string } & Invitation;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    const payload = response.data?.data;
    return { code: payload?.code as string, invitation: payload as unknown as Invitation };
  },

  // List organization invitations (ADMIN/DISPATCHER)
  list: async (params?: { status?: string; page?: number; limit?: number }) => {

    const response = await call(invitationsEndpoints.list, undefined, { query: {
      status: params?.status,
      page: params?.page,
      limit: params?.limit,
    } }) as ApiResponse<{
      success: boolean;
      data: Invitation[];
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Validate an invitation code (Public)
  validate: async (code: string) => {
    const response = await call(invitationsEndpoints.validate, { code }) as ApiResponse<InvitationValidation>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Revoke an invitation (ADMIN/DISPATCHER)
  revoke: async (id: string) => {
    const response = await call(invitationsEndpoints.revoke, { id }) as ApiResponse<{
      success: boolean;
      message: string;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },
};
