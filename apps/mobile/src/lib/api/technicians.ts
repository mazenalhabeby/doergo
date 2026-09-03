import { buildUrlWithQuery } from '@hbcfield/shared/client';
import { fetchWithAuth } from './client';
import type { TechniciansListResponse, TechnicianListItem } from './types';
import type { TimeOffRequest, AvailabilityResponse, ScheduleEntry } from './types';

// Technicians API - admin/dispatcher listing
export const techniciansApi = {
  list: async (params?: { search?: string; status?: string; page?: number; limit?: number }): Promise<TechniciansListResponse> => {
    const endpoint = buildUrlWithQuery('/employees', params ?? {});
    return fetchWithAuth<TechniciansListResponse>(endpoint, { method: 'GET' });
  },

  getById: async (id: string): Promise<TechnicianListItem> => {
    return fetchWithAuth<TechnicianListItem>(`/employees/${id}`, { method: 'GET' });
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
    const endpoint = buildUrlWithQuery('/employees/time-off', { status });
    const result = await fetchWithAuth<any>(endpoint, { method: 'GET' });
    return Array.isArray(result) ? result : result?.data ?? [];
  },

  list: async (technicianId: string, status?: string): Promise<TimeOffRequest[]> => {
    const endpoint = buildUrlWithQuery(`/employees/${technicianId}/time-off`, { status });
    return fetchWithAuth<TimeOffRequest[]>(endpoint, { method: 'GET' });
  },

  request: async (technicianId: string, data: { startDate: string; endDate: string; reason?: string }): Promise<TimeOffRequest> => {
    return fetchWithAuth<TimeOffRequest>(`/employees/${technicianId}/time-off`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  cancel: async (timeOffId: string): Promise<void> => {
    return fetchWithAuth<void>(`/employees/time-off/${timeOffId}`, {
      method: 'DELETE',
    });
  },

  approve: async (timeOffId: string, data: { approved: boolean; rejectionReason?: string }): Promise<TimeOffRequest> => {
    return fetchWithAuth<TimeOffRequest>(`/employees/time-off/${timeOffId}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};

// Availability API
export const availabilityApi = {
  getForDate: async (date: string): Promise<AvailabilityResponse> => {
    const endpoint = buildUrlWithQuery('/employees/availability', { date });
    return fetchWithAuth<AvailabilityResponse>(endpoint, { method: 'GET' });
  },
};

// Schedule API
export const scheduleApi = {
  getMine: async (technicianId: string): Promise<ScheduleEntry[]> => {
    const result = await fetchWithAuth<{ schedule: ScheduleEntry[] }>(`/employees/${technicianId}/schedule`, { method: 'GET' });
    return result.schedule || [];
  },
};
