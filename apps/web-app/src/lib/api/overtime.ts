import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { OvertimeRequest, PaginationMeta } from './types/overtime';
import { attendanceEndpoints, overtimeEndpoints } from '@hbcfield/shared/client';

export const overtimeApi = {
  getPendingApprovals: async () => {
    const response = await call(overtimeEndpoints.pendingApprovals) as ApiResponse<{ success: boolean; data: OvertimeRequest[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  approve: async (id: string, data: { maxDurationMinutes: number; notes?: string }) => {
    const response = await call(overtimeEndpoints.approve, { id }, { body: data }) as ApiResponse<{ success: boolean; data: OvertimeRequest }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  reject: async (id: string, data: { reason: string }) => {
    const response = await call(overtimeEndpoints.reject, { id }, { body: data }) as ApiResponse<{ success: boolean; data: OvertimeRequest }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  /** Remove an approved overtime as if it never was: the shift end moves back and the day is recounted. */
  remove: async (id: string) => {
    const response = await call(attendanceEndpoints.removeOvertime, { id }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  getHistory: async (params?: { technicianId?: string; status?: string; page?: number; limit?: number }) => {
    const response = await call(overtimeEndpoints.history, undefined, { query: {
      technicianId: params?.technicianId,
      status: params?.status,
      page: params?.page,
      limit: params?.limit,
    } }) as ApiResponse<{ success: boolean; data: { data: OvertimeRequest[]; meta: PaginationMeta } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
};
