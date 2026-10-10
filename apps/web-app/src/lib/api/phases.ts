import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { Phase } from './types/phases';
import { phasesWebEndpoints } from '@hbcfield/shared/client';

// ============================================================================
// PHASES API
// ============================================================================

export const phasesApi = {
  list: async () => {
    const response = await call(phasesWebEndpoints.list) as ApiResponse<{ success: boolean; data: Phase[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },
};
