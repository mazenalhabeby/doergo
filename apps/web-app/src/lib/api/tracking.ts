import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { TaskRoute, WorkerCurrentRoute, WorkerLocation } from './types/tracking';
import { trackingEndpoints } from '@hbcfield/shared/client';

// Tracking API methods (DISPATCHER only)
export const trackingApi = {
  // Get all active worker locations
  getWorkers: async () => {
    const response = await call(trackingEndpoints.workers) as ApiResponse<{ success: boolean; data: WorkerLocation[] }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  // Live worker locations for a cross-org shared space (guest view; showTracking).
  getSpaceWorkers: async (spaceId: string) => {
    const response = await call(trackingEndpoints.spaceWorkers, { spaceId }) as ApiResponse<{ success: boolean; data: WorkerLocation[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  // Get specific worker location
  getWorkerLocation: async (workerId: string) => {
    const response = await call(trackingEndpoints.worker, { id: workerId }) as ApiResponse<{ success: boolean; data: WorkerLocation }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Get worker's current EN_ROUTE journey
  getWorkerCurrentRoute: async (workerId: string) => {
    const response = await call(trackingEndpoints.currentRoute, { id: workerId }) as ApiResponse<{ success: boolean; data: WorkerCurrentRoute | null }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Get full route for a completed task
  getTaskRoute: async (taskId: string) => {
    const response = await call(trackingEndpoints.taskRoute, { taskId }) as ApiResponse<{ success: boolean; data: TaskRoute | null }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },
};
