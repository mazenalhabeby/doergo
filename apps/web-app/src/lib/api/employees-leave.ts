import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  CoverRangeSpace,
  FloorSpace,
  LeaveBalance,
  OrgTimeOffRequest,
  TimeOffRequest,
  TimeOffStatus,
} from './types/employees';
import { LEAVE_ONLY_OPTIONS, normalizeRequestOptions, type RequestOptions } from '../requests';
import { employeesEndpoints, timeOffEndpoints, type RequestInput } from '@hbcfield/shared/client';

/** Leave and cover: the organization's time off, the floor, a member's requests and their decisions. Part of `employeesApi`, moved here unchanged. */
export const employeeLeaveApi = {
  // ========================================================================
  // TIME-OFF MANAGEMENT
  // ========================================================================

  // Get all time-off requests for the organization. Pending rows carry a cover
  // verdict, so the list can be decided without opening anything.
  getOrgTimeOff: async (status?: TimeOffStatus, range?: { from: string; to: string }) => {

    const response = await call(
      timeOffEndpoints.listOrg,
      undefined,
      { query: { status, from: range?.from, to: range?.to } }) as ApiResponse<{
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
    const response = await call(
      employeesEndpoints.coverRange,
      { start, end }) as ApiResponse<{ success: boolean; data: CoverRangeSpace[] }>;
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

  /**
   * What the caller may ask for here. A server without the route (404) — or one
   * that cannot answer — still lets a member ask for leave, which is what this
   * page always offered.
   */
  getRequestOptions: async (): Promise<RequestOptions> => {
    const response = await call(timeOffEndpoints.requestOptions) as ApiResponse<{ success: boolean; data: unknown }>;
    if (response.status === 404) return LEAVE_ONLY_OPTIONS;
    if (response.error) throw apiError(response);
    return normalizeRequestOptions(response.data?.data ?? response.data);
  },

  // Send a request — any kind (leave, remote, hours, overtime, other), as `parseRequestInput` shaped it.
  requestTimeOff: async (id: string, data: RequestInput | { startDate: string; endDate: string; reason?: string; type?: string }) => {
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
    const response = await call(
      timeOffEndpoints.update,
      { timeOffId },
      { body: input }) as ApiResponse<{ success: boolean; data: TimeOffRequest }>;
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
