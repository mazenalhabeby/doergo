import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import {
  employeesEndpoints,
  type CreateEmployeeInput,
  type EmployeeListItem,
  type EmployeeProfile,
  type EmployeeStats,
  type EmployeesQueryParams,
  type UpdateEmployeeInput
} from '@hbcfield/shared/client';
import { employeeRecordsApi } from './employees-records';
import { employeeLeaveApi } from './employees-leave';

// ============================================================================
// EMPLOYEES API
// ============================================================================

export const employeesApi = {
  // List employees with filtering and pagination
  list: async (params?: EmployeesQueryParams) => {

    const response = await call(employeesEndpoints.list, undefined, { query: {
      status: params?.status,
      specialty: params?.specialty,
      search: params?.search,
      page: params?.page,
      limit: params?.limit,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
    } }) as ApiResponse<{
      success: boolean;
      data: EmployeeListItem[];
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Get employee detail with stats
  getById: async (id: string) => {
    const response = await call(employeesEndpoints.get, { id }) as ApiResponse<{
      success: boolean;
      data: EmployeeProfile & { stats: EmployeeStats };
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Create new employee
  create: async (input: CreateEmployeeInput) => {
    const response = await call(employeesEndpoints.create, undefined, { body: input }) as ApiResponse<{
      success: boolean;
      data: EmployeeProfile;
      generatedPassword?: string;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Update employee
  update: async (id: string, input: UpdateEmployeeInput) => {
    const response = await call(employeesEndpoints.update, { id }, { body: input }) as ApiResponse<{
      success: boolean;
      data: EmployeeProfile;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },
  ...employeeRecordsApi,
  ...employeeLeaveApi,
};
