import type { RequestKindOptions } from '@hbcfield/shared/client';
import {
  ApiError, requestKindsOffered,
  type EmployeesQueryParams, type EndpointBody, type RequestKind,
} from '@hbcfield/shared/client';
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

  /** Any request — leave, remote, hours, overtime, other (shared requests/request-kinds.ts). */
  request: async (technicianId: string, data: EndpointBody<typeof E.timeOff.request>): Promise<TimeOffRequest> => {
    return call(E.timeOff.request, { employeeId: technicianId }, { body: data });
  },

  cancel: async (timeOffId: string): Promise<void> => {
    return call(E.timeOff.cancel, { timeOffId });
  },

  approve: async (timeOffId: string, data: { approved: boolean; rejectionReason?: string }): Promise<TimeOffRequest> => {
    return call(E.timeOff.approve, { timeOffId }, { body: data });
  },
};

/** What the member may ask for, and where they may work remotely — the shared shape. */
export type RequestOptions = RequestKindOptions;

/** A server from before requests: it still takes leave, and the phone offers no more than the contract's default. */
export const OPTIONS_BEFORE_REQUESTS: RequestOptions = {
  kinds: requestKindsOffered({ enabled: [], mayWorkRemotely: false }),
  remoteSpaces: [],
};

export const requestsApi = {
  myOptions: async (): Promise<RequestOptions> => {
    try {
      const r = await call(E.timeOff.requestOptions);
      const kinds = Array.isArray(r?.kinds) ? r.kinds : OPTIONS_BEFORE_REQUESTS.kinds;
      return { kinds, remoteSpaces: Array.isArray(r?.remoteSpaces) ? r.remoteSpaces : [] };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return OPTIONS_BEFORE_REQUESTS;
      throw err;
    }
  },
  /** This year's allowance: what is left, and what requests already waiting will take. */
  leaveBalance: async (employeeId: string): Promise<{ year: number; allowance: number; taken: number; pending: number; remaining: number } | null> => {
    const r = (await call(E.employees.leaveBalance, { id: employeeId })) as { year?: number; remaining?: number } | null;
    return r && typeof r.remaining === 'number' ? (r as never) : null;
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
