import { buildUrlWithQuery } from '@hbcfield/shared/client';
import { fetchWithAuth } from './client';
import type { TimeEntry, AttendanceStatus, Break, BreakStatus, ClockInInput, ClockOutInput, AttendanceHistoryParams, PaginatedResponse, GeofenceExcursion } from './types';
import type { BreakType } from './types';

/** A scheduled shift with no clock-in — the shape `/attendance/no-shows` returns. */
export interface NoShow {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  spaceId: string;
  spaceName: string;
  expectedClockInAt: string;
  expectedClockOutAt: string;
  state: string;
  reminderCount: number;
  localDate: string;
  excuseReason?: string | null;
}

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
    inRing: boolean;
    distance: number;
    autoClockedOut: boolean; // always false now — kept for backward compat
    activeExcursion: GeofenceExcursion | null;
  }> => {
    return fetchWithAuth('/attendance/heartbeat', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** Report a reason + how long you'll be outside the ring (OUT_UNREPORTED → PENDING). */
  reportExcursion: async (reason: string, requestedMinutes: number): Promise<GeofenceExcursion> => {
    return fetchWithAuth<GeofenceExcursion>('/attendance/excursions/report', {
      method: 'POST',
      body: JSON.stringify({ reason, requestedMinutes }),
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

  /**
   * Time entries in the caller's spaces — one day, or a range.
   *
   * `date` and `startDate`/`endDate` are alternatives on the server: a single
   * day stays a one-day query rather than a range of length one. `search`
   * matches a member's name, and is applied in the query, so a phone asking
   * about one person does not page through a month of everybody else.
   */
  getAllEntries: async (params?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<TimeEntry[]> => {
    const endpoint = buildUrlWithQuery('/attendance/all-entries', {
      date: params?.date,
      startDate: params?.startDate,
      endDate: params?.endDate,
      status: params?.status,
      search: params?.search,
      page: params?.page,
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

  // ── Review surface (whoever holds the attendance permissions) ─────────────
  //
  // Every route below is `@RequirePermissionInSpace`, so the server narrows the
  // answer to the caller's own spaces: the same request returns the whole
  // organization to an admin and one site to its supervisor. Nothing here is
  // filtered on the client.

  /** Completed entries waiting for a decision (`canViewSpaceAttendance`). */
  getPendingApprovals: async (params?: { page?: number; limit?: number }): Promise<TimeEntry[]> => {
    const endpoint = buildUrlWithQuery('/attendance/approvals/pending', {
      page: params?.page,
      limit: params?.limit ?? 30,
    });
    const result = await fetchWithAuth<any>(endpoint, { method: 'GET' });
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /** Approve one entry (`canReconcileAttendance`). */
  approveEntry: async (entryId: string, notes?: string): Promise<TimeEntry> => {
    return fetchWithAuth<TimeEntry>(`/attendance/approvals/${entryId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  /** Reject one entry — the reason is required and is shown to the member. */
  rejectEntry: async (entryId: string, reason: string): Promise<TimeEntry> => {
    return fetchWithAuth<TimeEntry>(`/attendance/approvals/${entryId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /**
   * Correct a shift's times or note (`canReconcileAttendance`).
   *
   * `reason` is required by the server and kept with the entry: an edited shift
   * says who changed it, when, from what, and why — the member's pay depends on
   * these numbers, so a silent correction is not an option.
   */
  editEntry: async (
    entryId: string,
    body: { clockInAt?: string; clockOutAt?: string; notes?: string; timezone?: string; reason: string },
  ): Promise<TimeEntry> => {
    return fetchWithAuth<TimeEntry>(`/attendance/entries/${entryId}/edit`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  /** Scheduled shifts nobody clocked in for (`canViewSpaceAttendance`). */
  listNoShows: async (days = 7): Promise<NoShow[]> => {
    const result = await fetchWithAuth<any>(buildUrlWithQuery('/attendance/no-shows', { days }), { method: 'GET' });
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /** Excuse a no-show, or put it back on the list (`canReconcileAttendance`). */
  resolveNoShow: async (id: string, action: 'excuse' | 'reopen', reason?: string): Promise<NoShow> => {
    return fetchWithAuth<NoShow>(`/attendance/no-shows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, reason }),
    });
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
