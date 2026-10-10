import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { CompleteTaskInput, PartUsed, ServiceReport, ServiceReportSummary, UpdateReportInput } from './types/reports';
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

  // Complete a task with service report (TECHNICIAN only)
  completeTask: async (taskId: string, input: CompleteTaskInput) => {
    const response = await call(tasksEndpoints.complete, { id: taskId }, { body: input }) as ApiResponse<{ success: boolean; data: ServiceReport }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Update a service report (TECHNICIAN only, within 24 hours)
  updateReport: async (reportId: string, input: UpdateReportInput) => {
    const response = await call(reportsEndpoints.update, { id: reportId }, { body: input }) as ApiResponse<{ success: boolean; data: ServiceReport }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Add a part to a report
  addPart: async (
    reportId: string,
    part: { name: string; partNumber?: string; quantity: number; unitCost?: number; notes?: string }
  ) => {
    const response = await call(reportsEndpoints.addPart, { id: reportId }, { body: part }) as ApiResponse<{ success: boolean; data: PartUsed }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Delete a part from a report
  deletePart: async (reportId: string, partId: string) => {
    const response = await call(reportsEndpoints.removePart, { id: reportId, partId }) as ApiResponse<{ success: boolean; message: string }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },
};
