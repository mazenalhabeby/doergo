import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { joinRequestsEndpoints, type JoinRequest } from '@hbcfield/shared/client';

// ============================================================================
// JOIN REQUESTS API
// ============================================================================

export const joinRequestsApi = {
  list: async (params?: { status?: string; page?: number; limit?: number }) => {
    const response = await call(joinRequestsEndpoints.list, undefined, { query: {
      status: params?.status,
      page: params?.page,
      limit: params?.limit,
    } }) as ApiResponse<{
      success: boolean;
      data: JoinRequest[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  approve: async (id: string, data: {
    role: string;
    workMode?: string;
    specialty?: string;
    maxDailyJobs?: number;
  }) => {
    const response = await call(
      joinRequestsEndpoints.approve,
      { id },
      { body: data }) as ApiResponse<{ success: boolean; data: JoinRequest }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  reject: async (id: string, data?: { reason?: string }) => {
    const response = await call(
      joinRequestsEndpoints.reject,
      { id },
      { body: data || {} }) as ApiResponse<{ success: boolean; data: JoinRequest }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
};
