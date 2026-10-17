import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { AttendanceListResponse, BreakSummary, NoShowRow } from './types/attendance';
import {
  BreakType,
  attendanceEndpoints,
  type Break,
  type GeofenceExcursion,
  type NoShowPersonSummary,
  type TimeEntry,
} from '@hbcfield/shared/client';

/** What the office reviews: no-shows, approvals, excursions, the rests running and their history. Part of `attendanceApi`, moved here unchanged. */
export const attendanceReviewApi = {
  // No-shows: scheduled shifts with no clock-in (reminded/escalated/excused).
  listNoShows: async (params?: { days?: number; spaceId?: string }) => {
    const response = await call(attendanceEndpoints.noShows, undefined, { query: { days: params?.days, spaceId: params?.spaceId } }) as ApiResponse<{ success: boolean; data: NoShowRow[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? [];
  },

  resolveNoShow: async (id: string, action: "excuse" | "absent" | "reopen", reason?: string) => {
    const response = await call(attendanceEndpoints.resolveNoShow, { id }, { body: { action, reason } }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  /** The no-show record: one row per person who missed a planned shift in the period. */
  noShowSummary: async (params?: { days?: number; spaceId?: string }) => {
    const response = await call(attendanceEndpoints.noShowSummary, undefined, { query: { days: params?.days, spaceId: params?.spaceId } }) as ApiResponse<{ success: boolean; data: NoShowPersonSummary[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? [];
  },

  // =========================================================================
  // APPROVALS
  // =========================================================================

  // Get pending approvals
  getPendingApprovals: async (params?: { page?: number; limit?: number }) => {

    const response = await call(attendanceEndpoints.pendingApprovals, undefined, { query: params ?? {} }) as ApiResponse<AttendanceListResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Approve a time entry
  approveEntry: async (entryId: string, notes?: string) => {
    const response = await call(attendanceEndpoints.approve, { id: entryId }, { body: { notes } }) as ApiResponse<{
      success: boolean;
      data: TimeEntry;
      message: string;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Reject a time entry
  rejectEntry: async (entryId: string, reason: string) => {
    const response = await call(attendanceEndpoints.reject, { id: entryId }, { body: { reason } }) as ApiResponse<{
      success: boolean;
      data: TimeEntry;
      message: string;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // ── Geofence excursions ("out of ring") ──
  // List active (PENDING/APPROVED) out-of-ring requests for the approver surface.
  listExcursions: async (status?: "active" | "pending" | "approved") => {
    const response = await call(attendanceEndpoints.excursions, undefined, { query: status ? { status } : {} }) as ApiResponse<{ success: boolean; data: GeofenceExcursion[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? [];
  },

  // Approve an out-of-ring request (optionally adjusting the granted minutes).
  approveExcursion: async (excursionId: string, grantedMinutes?: number) => {
    const response = await call(attendanceEndpoints.approveExcursion, { id: excursionId }, { body: grantedMinutes != null ? { grantedMinutes } : {} }) as ApiResponse<{ success: boolean; data: GeofenceExcursion }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // Reject an out-of-ring request → the worker is clocked out.
  rejectExcursion: async (excursionId: string) => {
    const response = await call(attendanceEndpoints.rejectExcursion, { id: excursionId }, { body: {} }) as ApiResponse<{ success: boolean; data: GeofenceExcursion }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // =========================================================================
  // BREAKS
  // =========================================================================

  // Get all active breaks (organization-wide)
  getActiveBreaks: async () => {
    const response = await call(attendanceEndpoints.activeBreaks) as ApiResponse<{
      success: boolean;
      data: Break[];
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  // Get break history with optional filters
  getBreakHistory: async (params?: {
    date?: string;
    userId?: string;
    type?: BreakType;
    page?: number;
    limit?: number;
  }) => {

    const response = await call(attendanceEndpoints.breaksHistory, undefined, { query: params ?? {} }) as ApiResponse<{
      success: boolean;
      data: Break[];
      meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Get break summary for a date range
  getBreakSummary: async (params: { startDate: string; endDate: string; userId?: string }) => {

    const response = await call(attendanceEndpoints.breaksSummary, params) as ApiResponse<{
      success: boolean;
      data: BreakSummary;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // End a break manually (ADMIN only)
  endBreakManually: async (breakId: string, notes?: string) => {
    const response = await call(attendanceEndpoints.endBreakFor, { id: breakId }, { body: { notes } }) as ApiResponse<{
      success: boolean;
      data: Break;
      message: string;
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },
};
