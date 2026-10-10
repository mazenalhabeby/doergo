import type { EmployeesQueryParams } from '@hbcfield/shared/client';
import { call, E } from './client';
import type { TechniciansListResponse, TechnicianListItem } from './types';
import type { TimeOffRequest, AvailabilityResponse, ScheduleEntry } from './types';

// Technicians API - admin/dispatcher listing
export const techniciansApi = {
  list: async (params?: { search?: string; status?: string; page?: number; limit?: number }): Promise<TechniciansListResponse> => {
    // `status` is the server's active | inactive | all; a screen hands it over as a string.
    return call(E.employees.list, { ...params } as EmployeesQueryParams);
  },

  getById: async (id: string): Promise<TechnicianListItem> => {
    return call(E.employees.get, { id });
  },
};

// Time-Off API
export const timeOffApi = {
  /**
   * Every request the caller may decide, in ONE call.
   *
   * The approvals screen used to list the employees and then ask for each one's
   * leave — a fan-out that grew with the payroll, and one that a supervisor
   * could not run at all, because the employee directory is an org-wide read
   * they are refused. This endpoint answers with the organization for an
   * org-wide holder and with their own crew for a supervisor, from the same
   * request, because the server narrows it through the roster.
   */
  listOrg: async (status?: string): Promise<TimeOffRequest[]> => {
    const result = await call(E.timeOff.listOrg, { status });
    return Array.isArray(result) ? result : result?.data ?? [];
  },

  list: async (technicianId: string, status?: string): Promise<TimeOffRequest[]> => {
    return call(E.timeOff.listFor, { employeeId: technicianId, status });
  },

  request: async (technicianId: string, data: { startDate: string; endDate: string; reason?: string }): Promise<TimeOffRequest> => {
    return call(E.timeOff.request, { employeeId: technicianId }, { body: data });
  },

  cancel: async (timeOffId: string): Promise<void> => {
    return call(E.timeOff.cancel, { timeOffId });
  },

  approve: async (timeOffId: string, data: { approved: boolean; rejectionReason?: string }): Promise<TimeOffRequest> => {
    return call(E.timeOff.approve, { timeOffId }, { body: data });
  },
};

// Availability API
export const availabilityApi = {
  getForDate: async (date: string): Promise<AvailabilityResponse> => {
    return call(E.employees.availability, { date });
  },
  /** Every day from `startDate` to `endDate` (YYYY-MM-DD, inclusive) in ONE request — one entry per day. */
  getForRange: async (startDate: string, endDate: string): Promise<AvailabilityResponse[]> => {
    return call(E.employees.availability, { startDate, endDate });
  },
};

// Schedule API
export const scheduleApi = {
  getMine: async (technicianId: string): Promise<ScheduleEntry[]> => {
    // `{ success, data: null }` now arrives as null (envelope.ts), so read it null-safe.
    const result: { schedule: ScheduleEntry[] } | null = await call(E.employees.schedule, { id: technicianId });
    return result?.schedule || [];
  },
};
