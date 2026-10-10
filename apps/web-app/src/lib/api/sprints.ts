import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { Sprint } from './types/sprints';
import { sprintsWebEndpoints } from '@hbcfield/shared/client';

// ============================================================================
// SPRINTS API
// ============================================================================

export const sprintsApi = {
  list: async (status?: string) => {
    const response = await call(sprintsWebEndpoints.list, undefined, { query: { status: status || undefined } }) as ApiResponse<{ success: boolean; data: Sprint[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  create: async (data: { name: string; goal?: string; startDate: string; endDate: string }) => {
    const response = await call(sprintsWebEndpoints.create, undefined, { body: data }) as ApiResponse<{ success: boolean; data: Sprint }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<{ name: string; goal: string; startDate: string; endDate: string }>) => {
    const response = await call(sprintsWebEndpoints.update, { id }, { body: data }) as ApiResponse<{ success: boolean; data: Sprint }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  start: async (id: string) => {
    const response = await call(sprintsWebEndpoints.start, { id }) as ApiResponse<{ success: boolean; data: Sprint }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  complete: async (id: string) => {
    const response = await call(sprintsWebEndpoints.complete, { id }) as ApiResponse<{ success: boolean; data: Sprint }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await call(sprintsWebEndpoints.delete, { id }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  getVelocity: async (): Promise<{ sprintName: string; velocity: number }[]> => {
    const response = await call(sprintsWebEndpoints.getVelocity) as ApiResponse<{ success: boolean; data: { sprintName: string; velocity: number }[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },
};
