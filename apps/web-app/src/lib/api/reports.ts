import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { ServiceReport, ServiceReportSummary } from './types/reports';
import { reportsEndpoints, tasksEndpoints } from '@hbcfield/shared/client';

// Reports API methods
export const reportsApi = {
  // Get service report for a task
  getTaskReport: async (taskId: string) => {
    const response = await call(tasksEndpoints.report, { id: taskId }) as ApiResponse<{ success: boolean; data: ServiceReport }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Get all service reports for an asset (maintenance history)
  getAssetReports: async (assetId: string, params?: { page?: number; limit?: number }) => {

    const response = await call(reportsEndpoints.forAsset, { assetId }, { query: params ?? {} }) as ApiResponse<{
      success: boolean;
      data: ServiceReportSummary[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },
};
