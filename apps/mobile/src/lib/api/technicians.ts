import { buildUrlWithQuery } from '@hbcfield/shared/client';
import { fetchWithAuth } from './client';
import type { TechniciansListResponse, TechnicianListItem } from './types';
import type { TimeOffRequest, AvailabilityResponse, ScheduleEntry } from './types';

// Technicians API - admin/dispatcher listing
export const techniciansApi = {
  list: async (params?: { search?: string; status?: string; page?: number; limit?: number }): Promise<TechniciansListResponse> => {
    const endpoint = buildUrlWithQuery('/technicians', params ?? {});
    return fetchWithAuth<TechniciansListResponse>(endpoint, { method: 'GET' });
  },

  getById: async (id: string): Promise<TechnicianListItem> => {
    return fetchWithAuth<TechnicianListItem>(`/technicians/${id}`, { method: 'GET' });
  },
};

// Time-Off API
export const timeOffApi = {
  list: async (technicianId: string, status?: string): Promise<TimeOffRequest[]> => {
    const endpoint = buildUrlWithQuery(`/technicians/${technicianId}/time-off`, { status });
    return fetchWithAuth<TimeOffRequest[]>(endpoint, { method: 'GET' });
  },

  request: async (technicianId: string, data: { startDate: string; endDate: string; reason?: string }): Promise<TimeOffRequest> => {
    return fetchWithAuth<TimeOffRequest>(`/technicians/${technicianId}/time-off`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  cancel: async (timeOffId: string): Promise<void> => {
    return fetchWithAuth<void>(`/technicians/time-off/${timeOffId}`, {
      method: 'DELETE',
    });
  },
};

// Availability API
export const availabilityApi = {
  getForDate: async (date: string): Promise<AvailabilityResponse> => {
    const endpoint = buildUrlWithQuery('/technicians/availability', { date });
    return fetchWithAuth<AvailabilityResponse>(endpoint, { method: 'GET' });
  },
};

// Schedule API
export const scheduleApi = {
  getMine: async (technicianId: string): Promise<ScheduleEntry[]> => {
    const result = await fetchWithAuth<{ schedule: ScheduleEntry[] }>(`/technicians/${technicianId}/schedule`, { method: 'GET' });
    return result.schedule || [];
  },
};
