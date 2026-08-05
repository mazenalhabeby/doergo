import { buildUrlWithQuery } from '@hbcfield/shared/client';
import { fetchWithAuth } from './client';
import type { TimeEntry, AttendanceStatus, Break, BreakStatus, ClockInInput, ClockOutInput, AttendanceHistoryParams, PaginatedResponse } from './types';
import type { BreakType } from './types';

// Attendance API - clock-in/clock-out
export const attendanceApi = {
  getStatus: async (): Promise<AttendanceStatus> => {
    return fetchWithAuth<AttendanceStatus>('/attendance/status', { method: 'GET' });
  },

  clockIn: async (input: ClockInInput): Promise<TimeEntry> => {
    return fetchWithAuth<TimeEntry>('/attendance/clock-in', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  clockOut: async (input: ClockOutInput): Promise<TimeEntry> => {
    return fetchWithAuth<TimeEntry>('/attendance/clock-out', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  heartbeat: async (input: { lat: number; lng: number; accuracy?: number }): Promise<{
    withinGeofence: boolean;
    distance: number;
    autoClockedOut: boolean;
  }> => {
    return fetchWithAuth('/attendance/heartbeat', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getHistory: async (params?: AttendanceHistoryParams): Promise<PaginatedResponse<TimeEntry>> => {
    const endpoint = buildUrlWithQuery('/attendance/history', params ?? {});
    return fetchWithAuth<PaginatedResponse<TimeEntry>>(endpoint, { method: 'GET' });
  },

  startBreak: async (type?: BreakType, notes?: string): Promise<Break> => {
    const endpoint = buildUrlWithQuery('/attendance/breaks/start', { type });
    return fetchWithAuth<Break>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  endBreak: async (notes?: string): Promise<Break> => {
    return fetchWithAuth<Break>('/attendance/breaks/end', {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  getBreakStatus: async (): Promise<BreakStatus> => {
    return fetchWithAuth<BreakStatus>('/attendance/breaks/status', { method: 'GET' });
  },

  /** Admin view: all org time entries for a day (who is clocked in). */
  getAllEntries: async (params?: { date?: string; status?: string; limit?: number }): Promise<TimeEntry[]> => {
    const endpoint = buildUrlWithQuery('/attendance/all-entries', {
      date: params?.date,
      status: params?.status,
      limit: params?.limit ?? 500,
    });
    const result = await fetchWithAuth<any>(endpoint, { method: 'GET' });
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /** Who is clocked in RIGHT NOW, org-wide — date-independent (catches overnight
   *  shifts). Backs the admin dashboard presence. */
  getActiveEntries: async (): Promise<TimeEntry[]> => {
    const result = await fetchWithAuth<any>('/attendance/active-entries', { method: 'GET' });
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /** Admin view: breaks currently in progress across the org. */
  getActiveBreaks: async (): Promise<Array<{ userId: string; [k: string]: any }>> => {
    const result = await fetchWithAuth<any>('/attendance/breaks/active', { method: 'GET' });
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  // ── Shift reminder responses ──────────────────────────────────────────────

  /** "I forgot to clock out" — self-report the real leave time (ISO string). */
  resolveForgotClockOut: async (entryId: string, clockOutAt: string): Promise<TimeEntry> => {
    return fetchWithAuth<TimeEntry>(`/attendance/entries/${entryId}/forgot-clock-out`, {
      method: 'POST',
      body: JSON.stringify({ clockOutAt }),
    });
  },

  /** "I'm working extra time" — routes to a space leader for approval. */
  requestExtraTime: async (entryId: string): Promise<{ entryId: string; status: string }> => {
    return fetchWithAuth(`/attendance/entries/${entryId}/request-extra-time`, { method: 'POST' });
  },

  /** Leader: open extra-time requests the caller can approve. */
  getPendingExtraTime: async (): Promise<TimeEntry[]> => {
    const result = await fetchWithAuth<any>('/attendance/extra-time/pending', { method: 'GET' });
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /** Leader: approve N more minutes of overtime for an open shift. */
  approveExtraTime: async (entryId: string, minutes: number): Promise<any> => {
    return fetchWithAuth(`/attendance/extra-time/${entryId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    });
  },

  /** Leader: reject an extra-time request. */
  rejectExtraTime: async (entryId: string): Promise<any> => {
    return fetchWithAuth(`/attendance/extra-time/${entryId}/reject`, { method: 'POST' });
  },
};
