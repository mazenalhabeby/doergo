import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { ScheduleEntry, ScheduleEntryInput } from './types/employees';
import type { Task } from './types/tasks';
import {
  employeesEndpoints,
  type CompanyLocation,
  type PerformanceMetrics,
  type TimeEntry,
} from '@hbcfield/shared/client';

/** One member's record: performance, jobs, attendance, assignments, schedule. Part of `employeesApi`, moved here unchanged. */
export const employeeRecordsApi = {
  // Get performance metrics
  getPerformance: async (id: string, startDate?: string, endDate?: string) => {

    const response = await call(employeesEndpoints.performance, { id }, { query: {
      startDate,
      endDate,
    } }) as ApiResponse<{
      success: boolean;
      data: PerformanceMetrics;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Get task history
  // `startDate`/`endDate` filter on the DUE date — used by the leave drawer to
  // ask "what is already booked for this person while they want to be away".
  getTasks: async (
    id: string,
    params?: { status?: string; page?: number; limit?: number; startDate?: string; endDate?: string },
  ) => {

    const response = await call(employeesEndpoints.tasks, { id }, { query: params || {} }) as ApiResponse<{
      success: boolean;
      data: Task[];
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  // Get attendance history
  getAttendance: async (id: string, startDate?: string, endDate?: string) => {

    const response = await call(employeesEndpoints.attendance, { id }, { query: {
      startDate,
      endDate,
    } }) as ApiResponse<{
      success: boolean;
      data: TimeEntry[];
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  // Get location assignments
  getAssignments: async (id: string) => {
    const response = await call(employeesEndpoints.assignments, { id }) as ApiResponse<{
      success: boolean;
      data: {
        id: string;
        locationId: string;
        isPrimary: boolean;
        schedule: string[];
        effectiveFrom: string;
        effectiveTo?: string;
        location: CompanyLocation;
        /** Names only (the person's Access table); null = no role here. `personalAssignmentId` = their own set. */
        role?: { id: string; name: string; personalAssignmentId: string | null } | null;
        workRole?: { id: string; name: string } | null;
      }[];
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  // ========================================================================
  // SCHEDULE MANAGEMENT
  // ========================================================================

  // Get employee weekly schedule
  getSchedule: async (id: string) => {
    const response = await call(employeesEndpoints.schedule, { id }) as ApiResponse<{
      success: boolean;
      data: {
        technician: { id: string; firstName: string; lastName: string };
        schedule: ScheduleEntry[];
      };
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Set employee weekly schedule
  setSchedule: async (id: string, schedule: ScheduleEntryInput[]) => {
    const response = await call(employeesEndpoints.setSchedule, { id }, { body: { schedule } }) as ApiResponse<{
      success: boolean;
      data: ScheduleEntry[];
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },
};
