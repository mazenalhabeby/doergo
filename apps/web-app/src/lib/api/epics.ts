import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { Epic } from './types/epics';
import { epicsWebEndpoints } from '@hbcfield/shared/client';

export const epicsApi = {
  list: async () => {
    const response = await call(epicsWebEndpoints.list) as ApiResponse<{ success: boolean; data: Epic[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  create: async (data: { name: string; description?: string; color?: string; startDate?: string; targetDate?: string }) => {
    const response = await call(epicsWebEndpoints.create, undefined, { body: data }) as ApiResponse<{ success: boolean; data: Epic }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<{ name: string; description: string; color: string; startDate: string; targetDate: string }>) => {
    const response = await call(epicsWebEndpoints.update, { id }, { body: data }) as ApiResponse<{ success: boolean; data: Epic }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
};
