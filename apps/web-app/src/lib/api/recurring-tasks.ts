import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { RecurringTaskTemplate } from './types/recurring-tasks';
import { recurringTasksWebEndpoints } from '@hbcfield/shared/client';

export const recurringTasksApi = {
  list: async () => {
    const response = await call(recurringTasksWebEndpoints.list) as ApiResponse<{ success: boolean; data: RecurringTaskTemplate[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  create: async (data: Partial<RecurringTaskTemplate>) => {
    const response = await call(
      recurringTasksWebEndpoints.create,
      undefined,
      { body: data }) as ApiResponse<{ success: boolean; data: RecurringTaskTemplate }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<RecurringTaskTemplate>) => {
    const response = await call(
      recurringTasksWebEndpoints.update,
      { id },
      { body: data }) as ApiResponse<{ success: boolean; data: RecurringTaskTemplate }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await call(recurringTasksWebEndpoints.delete, { id }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  generate: async (id: string) => {
    const response = await call(recurringTasksWebEndpoints.generate, { id }) as ApiResponse<{ success: boolean; data: { taskId: string } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
};
