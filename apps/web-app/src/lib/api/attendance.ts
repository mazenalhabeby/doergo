import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { AttendanceListResponse, AttendanceQueryParams, BreakRuleRow, BreakSummary, EntryBreak, EntryEditHistoryItem, NoShowRow } from './types/attendance';
import { BreakType, attendanceEndpoints, locationsEndpoints, type Break, type CompanyLocation, type GeofenceExcursion, type NoShowPersonSummary, type TimeEntry } from '@hbcfield/shared/client';
import { attendanceBreaksApi } from './attendance-breaks';
import { attendanceEntriesApi } from './attendance-entries';
import { attendanceReviewApi } from './attendance-review';

export const attendanceApi = {
  // Employee self-service: my current clock status
  getMyStatus: async () => {
    const response = await call(attendanceEndpoints.status) as ApiResponse<{ success: boolean; data: unknown }>;
    if (response.error) throw apiError(response);
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  // Employee self-service: clock in at a company location. GPS comes from the
  // browser Geolocation API (device location, NOT IP) so it works over a VPN.
  clockIn: async (input: { locationId?: string; lat: number; lng: number; accuracy?: number; isRemote?: boolean }) => {
    const response = await call(attendanceEndpoints.clockIn, undefined, { body: input }) as ApiResponse<{ success: boolean; data: unknown }>;
    // Coded (OUTSIDE_GEOFENCE, AWAY_NOT_ALLOWED …) so the refusal is said in the reader's language.
    if (response.error) throw apiError(response);
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  // Employee self-service: clock out of the current shift.
  //
  // `earlyReason` is sent when the member confirmed leaving before the shift
  // ends. The server measures the shortfall itself — this is the answer to the
  // question, not the question.
  clockOut: async (input: {
    lat: number;
    lng: number;
    accuracy?: number;
    notes?: string;
    earlyReason?: string;
  }) => {
    const response = await call(attendanceEndpoints.clockOut, undefined, { body: input }) as ApiResponse<{ success: boolean; data: unknown; message?: string }>;
    if (response.error) throw apiError(response);
    /*
      The envelope's MESSAGE comes back with the entry.

      It carries the counted hours and any shortfall — "11h 30m counted, 1h 20m
      short of your shift" — composed once, on the server, from the figures it
      has just decided. Dropping it here and rebuilding the sentence on the
      client is how the two start disagreeing about somebody's hours.
    */
    const envelope = response.data as { data?: unknown; message?: string };
    const entry = (envelope?.data ?? response.data) as Record<string, unknown>;
    return { ...entry, message: envelope?.message };
  },

  /**
   * "When did you actually leave?" — for a shift the open-shift sweep closed
   * with a temporary time (or one still open). The member's answer replaces the
   * temporary clock-out; the server checks it is after clock-in and not ahead.
   */
  resolveForgotClockOut: async (entryId: string, clockOutAt: string) => {
    const response = await call(attendanceEndpoints.forgotClockOut, { id: entryId }, { body: { clockOutAt } }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (response.error) throw apiError(response);
    return (response.data as { data?: unknown })?.data ?? response.data;
  },
  ...attendanceBreaksApi,
  ...attendanceEntriesApi,
  ...attendanceReviewApi,
};
