import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { CoverRangeSpace, FloorSpace, LeaveBalance, OrgTimeOffRequest, ScheduleEntry, ScheduleEntryInput, TimeOffRequest, TimeOffStatus } from './types/employees';
import type { Task } from './types/tasks';
import { employeesEndpoints, timeOffEndpoints, type CompanyLocation, type CreateEmployeeInput, type EmployeeListItem, type EmployeeProfile, type EmployeeStats, type EmployeesQueryParams, type PerformanceMetrics, type TimeEntry, type UpdateEmployeeInput } from '@hbcfield/shared/client';

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

  // ========================================================================
  // TIME-OFF MANAGEMENT
  // ========================================================================

  // Get all time-off requests for the organization. Pending rows carry a cover
  // verdict, so the list can be decided without opening anything.
  getOrgTimeOff: async (status?: TimeOffStatus, range?: { from: string; to: string }) => {

    const response = await call(timeOffEndpoints.listOrg, undefined, { query: { status, from: range?.from, to: range?.to } }) as ApiResponse<{
      success: boolean;
      data: OrgTimeOffRequest[];
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  // Who is on the floor right now, per workspace. One read: the browser would
  // otherwise need the whole roster, every open shift and every active break to
  // work this out — slower, and more than the viewer is entitled to see.
  getFloorNow: async () => {
    const response = await call(employeesEndpoints.floorNow) as ApiResponse<{ success: boolean; data: FloorSpace[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  // Cover per workspace per day, for the chart footer. Computed server-side so
  // the footer and the verdict above it read the same rule — a count derived in
  // the browser would be a second implementation of "who is rostered".
  getCoverRange: async (start: string, end: string) => {
    const response = await call(employeesEndpoints.coverRange, { start, end }) as ApiResponse<{ success: boolean; data: CoverRangeSpace[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  // Get employee time-off requests
  getTimeOff: async (id: string, status?: TimeOffStatus) => {

    const response = await call(timeOffEndpoints.listFor, { employeeId: id }, { query: { status } }) as ApiResponse<{
      success: boolean;
      data: TimeOffRequest[];
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  /** This year's vacation allowance: total, taken, pending, remaining. */
  getLeaveBalance: async (id: string) => {
    const response = await call(employeesEndpoints.leaveBalance, { id }) as ApiResponse<{ success: boolean; data: LeaveBalance }>;
    return response.data?.data ?? null;
  },

  // Request time off
  requestTimeOff: async (id: string, data: { startDate: string; endDate: string; reason?: string; type?: string }) => {
    const response = await call(timeOffEndpoints.request, { employeeId: id }, { body: data }) as ApiResponse<{
      success: boolean;
      data: TimeOffRequest;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Admin: add an already-approved day off for an employee (any date, no
  // separate approval step).
  addTimeOff: async (data: {
    technicianId: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }) => {
    const response = await call(timeOffEndpoints.manual, undefined, { body: data }) as ApiResponse<{
      success: boolean;
      data: TimeOffRequest;
    }>;

    // `apiError` rather than `new Error`: this endpoint's overlap refusal carries
    // a code and the conflicting dates, so the dialog can say it in the reader's
    // language instead of showing the server's English.
    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Approve or reject time-off request
  approveTimeOff: async (timeOffId: string, approved: boolean, rejectionReason?: string) => {
    const response = await call(timeOffEndpoints.approve, { timeOffId }, { body: { approved, rejectionReason } }) as ApiResponse<{
      success: boolean;
      data: TimeOffRequest;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Cancel time-off request
  cancelTimeOff: async (timeOffId: string) => {
    const response = await call(timeOffEndpoints.cancel, { timeOffId }) as ApiResponse<{
      success: boolean;
      data: TimeOffRequest;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Admin: edit an existing day off (dates / reason)
  updateTimeOff: async (
    timeOffId: string,
    input: { startDate?: string; endDate?: string; reason?: string | null },
  ) => {
    const response = await call(timeOffEndpoints.update, { timeOffId }, { body: input }) as ApiResponse<{ success: boolean; data: TimeOffRequest }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data?.data;
  },

  // Admin: delete a day off
  adminDeleteTimeOff: async (timeOffId: string) => {
    const response = await call(timeOffEndpoints.removeManaged, { timeOffId }) as ApiResponse<{ success: boolean }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data;
  },
};
