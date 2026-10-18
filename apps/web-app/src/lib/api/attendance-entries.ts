import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  AttendanceListResponse,
  AttendanceQueryParams,
  EntryBreak,
  EntryEditHistoryItem,
} from './types/attendance';
import {
  attendanceEndpoints,
  locationsEndpoints,
  type CompanyLocation,
  type TimeEntry,
} from '@hbcfield/shared/client';

/**
 * Entries: history, a workspace's list, adding hours by hand, a rest on an entry, editing, overtime, deleting, the record. Part of
 * `attendanceApi`, moved here unchanged.
 */
export const attendanceEntriesApi = {
  // Employee self-service: my own time-entry history (paginated envelope)
  /**
   * The member's own shifts, for a window they chose.
   *
   * `startDate`/`endDate` have always been supported by the endpoint; the page
   * asked for "the last 60 entries" instead, which is not a period anybody
   * thinks in — a part-timer's sixty reach back six months and a full-timer's
   * three weeks.
   */
  getMyHistory: async (params?: { startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const response = await call(
      attendanceEndpoints.history,
      undefined,
      { query: params ?? {} }) as ApiResponse<{ data: TimeEntry[]; meta?: unknown }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // Get time entries for a specific location
  // Batched: today's entries for many spaces in one request (member-scoped).
  getEntriesBatch: async (locationIds: string[], date?: string) => {
    if (locationIds.length === 0) return [] as TimeEntry[];
    const response = await call(
      attendanceEndpoints.entries,
      { ids: locationIds, date }) as ApiResponse<{ success: boolean; data: TimeEntry[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  getLocationEntries: async (locationId: string, params?: AttendanceQueryParams) => {

    const response = await call(attendanceEndpoints.locationEntries, { locationId }, { query: {
      date: params?.date,
      startDate: params?.startDate,
      endDate: params?.endDate,
      search: params?.search,
      page: params?.page,
      limit: params?.limit,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
    } }) as ApiResponse<AttendanceListResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Get all locations for the organization
  /**
   * Where the CALLER may clock in, right now.
   *
   * Deliberately not `getLocations()`, which answers "what workspaces can I
   * see" — a manager can see the whole directory, and offering them a site they
   * are not assigned to produces a clock-in refused for a reason they cannot
   * act on. This returns only workspaces with an assignment active now, minus
   * the remote bucket and customer premises.
   */
  getClockInLocations: async () => {
    const response = await call(attendanceEndpoints.clockInLocations) as ApiResponse<{ success: boolean; data: CompanyLocation[] }>;
    if (response.error) throw apiError(response);
    return (response.data as { data?: CompanyLocation[] })?.data ?? [];
  },

  getLocations: async () => {
    const response = await call(locationsEndpoints.list) as ApiResponse<{ success: boolean; data: CompanyLocation[] }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  // Admin: add/back-date attendance for an employee (single day or a
  // weekday-filtered date-range backfill). Server builds one CLOCKED_OUT,
  // pre-approved TimeEntry per matching day (skips days that already have one).
  addManualEntries: async (input: {
    userId: string;
    locationId: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD (== startDate for a single day)
    weekdays?: number[]; // 0=Sun..6=Sat, only for a date range
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    /** The break, as both attendance dialogs describe it: wall-clock times. */
    breakStart?: string;
    breakEnd?: string;
    breakType?: "SHORT" | "LUNCH" | "OTHER";
    breakReason?: string;
    breakMinutes?: number;
    notes?: string;
    reason?: string;
  }) => {
    const response = await call(attendanceEndpoints.manualEntry, undefined, { body: input }) as ApiResponse<{
      success: boolean;
      data: { created: number; skipped: number };
      message?: string;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    const body = response.data as {
      data?: { created: number; skipped: number };
      message?: string;
    };
    return {
      ...(body?.data ?? { created: 0, skipped: 0 }),
      message: body?.message,
    };
  },

  /**
   * The breaks recorded on one shift, member-taken and manually added alike.
   *
   * The endpoint answers `{ data: { breaks, totalBreakMinutes, breakCount } }` —
   * an OBJECT under `data`, not an array. Reading it as an array and defaulting
   * to `[]` made the dialog report a shift with breaks as a shift with none, and
   * silently: a defensive fallback that hides a shape mismatch is worse than the
   * crash it prevents, because nothing ever says the guess was wrong.
   */
  entryBreaks: async (entryId: string) => {
    const response = await call(
      attendanceEndpoints.entryBreaks,
      { id: entryId }) as ApiResponse<{ success: boolean; data: { breaks?: EntryBreak[] } }>;
    if (response.error) throw apiError(response);
    return response.data?.data?.breaks ?? [];
  },

  /**
   * Remove a break from a shift.
   *
   * Also how an edit is performed — remove and re-add — rather than a second
   * endpoint repeating the same window and overlap validation.
   */
  removeBreak: async (breakId: string) => {
    const response = await call(attendanceEndpoints.removeBreak, { id: breakId }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
  },

  /**
   * Add a break to a member's shift.
   *
   * Breaks are self-service — this is the correction path for a shift where that
   * did not happen. The row records who added it and why, so it is never mistaken
   * for the member's own account of their day. Requires canReconcileAttendance.
   */
  addBreak: async (
    entryId: string,
    input: { type?: string; startedAt: string; endedAt: string; reason: string },
  ) => {
    const response = await call(
      attendanceEndpoints.addEntryBreak,
      { id: entryId },
      { body: input }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // Admin: correct a time entry (clock-in/out and/or notes). A reason is
  // required and the original values are preserved for audit server-side.
  editEntry: async (
    entryId: string,
    input: { clockInAt?: string; clockOutAt?: string; notes?: string; timezone?: string; reason: string }
  ) => {
    const response = await call(
      attendanceEndpoints.editEntry,
      { id: entryId },
      { body: input }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (response.error) {
      throw apiError(response);
    }
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  // Where a member worked through one entry: groups, reasons and times — never a position.
  getEntryPresence: async (entryId: string) => {
    const response = await call(
      attendanceEndpoints.entryPresence,
      {
        id: entryId
      }) as ApiResponse<{
        success: boolean;
        data: {
          presence: string | null;
          lastSeenAt: string | null;
          changes: { at: string; presence: "ON_SITE" | "FIELD" | "REMOTE"; reason: string; sentLate: boolean }[]
        }
      }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data?.data;
  },

  // Approved overtime on a closed shift: minutes counted from the shift end.
  addOvertime: async (entryId: string, input: { minutes: number; reason?: string }) => {
    const response = await call(
      attendanceEndpoints.entryOvertime,
      { id: entryId },
      { body: input }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data;
  },

  // Delete a time entry (admin)
  deleteEntry: async (entryId: string) => {
    const response = await call(attendanceEndpoints.removeEntry, { id: entryId }) as ApiResponse<{ success: boolean }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data;
  },

  // Full edit history (per-edit audit rows) for a time entry.
  getEntryHistory: async (entryId: string) => {
    const response = await call(
      attendanceEndpoints.entryHistory,
      { id: entryId }) as ApiResponse<{ success: boolean; data: EntryEditHistoryItem[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? []
  },

  // Get all time entries for the organization (admin view)
  getAllEntries: async (params?: AttendanceQueryParams) => {

    const response = await call(attendanceEndpoints.allEntries, undefined, { query: params ?? {} }) as ApiResponse<AttendanceListResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  /** Who is clocked in RIGHT NOW, org-wide — date-independent (catches overnight
   *  shifts). Backs the dashboard "on duty" presence. */
  getActiveEntries: async () => {
    const response = await call(attendanceEndpoints.activeEntries) as ApiResponse<{ success: boolean; data: TimeEntry[] }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data;
  },
};
