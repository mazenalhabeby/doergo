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

  create: async (data: { name: string; description?: string; color?: string; type?: string; startDate?: string; endDate?: string }) => {
    const response = await call(phasesWebEndpoints.create, undefined, { body: data }) as ApiResponse<{ success: boolean; data: Phase }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<{ name: string; description: string; color: string; type: string; startDate: string; endDate: string; isActive: boolean }>) => {
    const response = await call(phasesWebEndpoints.update, { id }, { body: data }) as ApiResponse<{ success: boolean; data: Phase }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await call(phasesWebEndpoints.delete, { id }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
};
