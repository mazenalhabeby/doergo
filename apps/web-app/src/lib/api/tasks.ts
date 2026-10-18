import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  CreateTaskInput,
  OnBehalf,
  StatusCountsResponse,
  TaskResponse,
  TasksListResponse,
  TasksQueryParams,
  UpdateTaskInput
} from './types/tasks'
import { tasksEndpoints, type StepFormAnswers } from '@hbcfield/shared/client';
import { taskWorkApi } from './tasks-work';
import { taskPartsApi } from './tasks-parts';

export const tasksApi = {
  // Get task counts grouped by status
  /** Task counts grouped by status (default) or by space, over everything the
   *  caller may see — not just the loaded page. */
  getStatusCounts: async (params?: { groupBy?: 'status' | 'space'; spaceId?: string }) => {
    const response = await call(
      tasksEndpoints.counts,
      undefined,
      { query: { groupBy: params?.groupBy, spaceId: params?.spaceId } }) as ApiResponse<StatusCountsResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || {};
  },

  // Get all tasks with optional filters
  list: async (params?: TasksQueryParams) => {

    const response = await call(tasksEndpoints.list, undefined, { query: {
      status: params?.status !== 'all' ? params?.status : undefined,
      // The server filters on these; doing it in the browser only ever filtered
      // the page that happened to be loaded.
      statuses: params?.statuses?.length ? params.statuses.join(',') : undefined,
      search: params?.search?.trim() || undefined,
      sprintId: params?.sprintId !== 'all' ? params?.sprintId : undefined,
      epicId: params?.epicId !== 'all' ? params?.epicId : undefined,
      priority: params?.priority !== 'all' ? params?.priority : undefined,
      page: params?.page,
      limit: params?.limit,
      // The server scopes to this space (incl. cross-org shared spaces).
      spaceId: params?.spaceId,
      customerId: params?.customerId,
      unitId: params?.unitId,
      assignedToMe: params?.assignedToMe ? 'true' : undefined,
    } }) as ApiResponse<TasksListResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Get a single task by ID
  getById: async (id: string) => {
    const response = await call(tasksEndpoints.get, { id }) as ApiResponse<TaskResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Create a new task
  create: async (input: CreateTaskInput) => {
    const response = await call(tasksEndpoints.create, undefined, { body: input }) as ApiResponse<TaskResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Update a task
  update: async (id: string, input: UpdateTaskInput) => {
    const response = await call(tasksEndpoints.update, { id }, { body: input }) as ApiResponse<TaskResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Delete a task
  delete: async (id: string) => {
    const response = await call(tasksEndpoints.remove, { id }) as ApiResponse<{ success: boolean; message: string }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Assign a task to an employee (DISPATCHER only)
  assign: async (id: string, workerId: string) => {
    const response = await call(tasksEndpoints.assign, { id }, { body: { workerId } }) as ApiResponse<TaskResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Update task status (TECHNICIAN only)
  updateStatus: async (id: string, status: string, reason?: string, answers?: StepFormAnswers, onBehalf?: OnBehalf) => {
    const response = await call(tasksEndpoints.setStatus, { id }, { body: {
      status,
      reason,
      // Only when the step asked something — see `useStepMove`.
      ...(answers !== undefined ? { answers } : {}),
      // The office starting somebody's job for them — see `useOfficeStart`.
      ...(onBehalf ? { onBehalf } : {}),
    } }) as ApiResponse<TaskResponse>;

    // Coded: a step-form refusal (STEP_FORM_INVALID / _FOREIGN_FILE) names the
    // fields it refused, and the move dialog shows each one where it belongs.
    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },
  ...taskWorkApi,
  ...taskPartsApi,
};
