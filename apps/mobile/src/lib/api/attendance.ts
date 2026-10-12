import { call, E } from './client';
import type { TimeEntry, AttendanceStatus, Break, BreakStatus, ClockInInput, ClockOutInput, AttendanceHistoryParams, PaginatedResponse, GeofenceExcursion } from './types';
import type { BreakType } from './types';

export type { NoShow } from '@hbcfield/shared/client';
import type { AutoClockPlan, NoShow } from '@hbcfield/shared/client';

// Attendance API - clock-in/clock-out
export const attendanceApi = {
  getStatus: async (): Promise<AttendanceStatus> => {
    return call(E.attendance.status);
  },

  clockIn: async (input: ClockInInput): Promise<TimeEntry> => {
    return call(E.attendance.clockIn, undefined, { body: input });
  },

  clockOut: async (input: ClockOutInput): Promise<TimeEntry> => {
    return call(E.attendance.clockOut, undefined, { body: input });
  },

  /** Where the automatic clock arms for the caller, today and tomorrow (services/auto-clock). 404 on an older server. */
  autoClockPlan: async (): Promise<AutoClockPlan> => {
    return call(E.attendance.autoClockPlan);
  },

  /** The member's own consent to the automatic clock; `false` withdraws it. */
  autoClockConsent: async (consent: boolean): Promise<{ consentAt: string | null }> => {
    return call(E.attendance.autoClockConsent, undefined, { body: { consent } });
  },

  heartbeat: async (input: { lat: number; lng: number; accuracy?: number }): Promise<{
    withinGeofence: boolean;
    inRing: boolean;
    distance: number;
    autoClockedOut: boolean; // always false now — kept for backward compat
    activeExcursion: GeofenceExcursion | null;
  }> => {
    return call(E.attendance.heartbeat, undefined, { body: input });
  },

  /** Check-ins kept while the phone had no signal, each with the moment it was taken. */
  heartbeatBatch: async (points: { lat: number; lng: number; accuracy?: number; recordedAt: string }[]): Promise<{
    recorded: number;
    opened: boolean;
    returned: boolean;
  }> => {
    return call(E.attendance.heartbeatBatch, undefined, { body: { points } });
  },

  /** Report a reason + how long you'll be outside the ring (OUT_UNREPORTED → PENDING). */
  reportExcursion: async (reason: string, requestedMinutes: number): Promise<GeofenceExcursion> => {
    return call(E.attendance.reportExcursion, undefined, { body: { reason, requestedMinutes } });
  },

  /**
   * ⚠️ THE RETURN TYPE IS A LIE THAT COST A DAY. The server answers
   * `{ success, data: [ … ] }` — a BARE ARRAY once the client unwraps the
   * envelope — not `{ data, meta }`. Anything reading `res.data` gets
   * `undefined` with a 200 and no error anywhere to say so.
   *
   * Left as declared rather than corrected here because several screens
   * already destructure it defensively; callers must handle both shapes. See
   * `components/home/use-schedule-totals.ts` for the one that was bitten.
   */
  getHistory: async (params?: AttendanceHistoryParams): Promise<PaginatedResponse<TimeEntry>> => {
    return call(E.attendance.history, params ?? {});
  },

  /**
   * Start a rest. `ruleId` names the planned one it satisfies; without it the
   * server picks whichever is next, which is what "take my rest now" means.
   */
  startBreak: async (type?: BreakType, notes?: string, ruleId?: string): Promise<Break> => {
    return call(E.attendance.startBreak, { type }, { body: { notes, ruleId } });
  },

  /**
   * "Later."
   *
   * The count is kept by the SERVER. If the phone kept it, this would be a mute
   * button — and a phone that is off, flat or in a basement would silence the
   * alarm by not existing.
   */
  snoozeBreak: async (ruleId?: string): Promise<{ state: string; dueAt?: string; snoozeCount: number }> => {
    return call(E.attendance.snoozeBreak, undefined, { body: { ruleId } });
  },

  endBreak: async (notes?: string): Promise<Break> => {
    return call(E.attendance.endBreak, undefined, { body: { notes } });
  },

  getBreakStatus: async (): Promise<BreakStatus> => {
    return call(E.attendance.breakStatus);
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
    const result = await call(E.attendance.allEntries, {
      date: params?.date,
      startDate: params?.startDate,
      endDate: params?.endDate,
      status: params?.status,
      search: params?.search,
      page: params?.page,
      limit: params?.limit ?? 500,
    });
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /**
   * Everyone on the clock now, EVERY page — the home Crew card.
   *
   * ⚠️ One page silently capped the crew: past 300 on the clock the rings
   * counted 300 and nobody knew. A FULL page means there may be more, so the
   * next is asked for; a short page is the end. (The client unwraps `data`
   * and drops `meta.total`, so a full page is the signal.) One request for
   * any normal site; bounded at 10 pages (5,000 people).
   */
  getClockedInAll: async (): Promise<TimeEntry[]> => {
    const PAGE = 500;
    const rows: TimeEntry[] = [];
    for (let n = 1; n <= 10; n++) {
      const r = await call(E.attendance.allEntries, { status: 'CLOCKED_IN', page: n, limit: PAGE });
      const got: TimeEntry[] = Array.isArray(r) ? r : r?.data ?? [];
      rows.push(...got);
      if (got.length < PAGE) break;
    }
    return rows;
  },

  /** Who is clocked in RIGHT NOW, org-wide — date-independent (catches overnight
   *  shifts). Backs the admin dashboard presence. */
  getActiveEntries: async (): Promise<TimeEntry[]> => {
    const result = await call(E.attendance.activeEntries);
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /** Admin view: breaks currently in progress across the org. */
  getActiveBreaks: async (): Promise<Array<{ userId: string; [k: string]: any }>> => {
    const result = await call(E.attendance.activeBreaks);
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
    const result = await call(E.attendance.pendingApprovals, { page: params?.page, limit: params?.limit ?? 30 });
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /** Approve one entry (`canApproveAttendance`). */
  approveEntry: async (entryId: string, notes?: string): Promise<TimeEntry> => {
    return call(E.attendance.approve, { id: entryId }, { body: { notes } });
  },

  /** Reject one entry (`canApproveAttendance`) — the reason is required and is shown to the member. */
  rejectEntry: async (entryId: string, reason: string): Promise<TimeEntry> => {
    return call(E.attendance.reject, { id: entryId }, { body: { reason } });
  },

  /**
   * HOW MANY shifts are waiting — not which ones.
   *
   * The home screen shows a count, so it asks for a count: one row with the
   * total in the envelope's meta, rather than pulling thirty entries (each with
   * its user, its space and its breaks) to call `.length` on them.
   */
  /**
   * Shifts waiting for a decision: how many, and how many per workspace — the
   * counts only (`?summary=true`, a grouped count on the server). The Crew card
   * used to download a whole page of shifts every minute to count them.
   */
  pendingApprovalsSummary: async (): Promise<{ total: number; bySpace: Record<string, number> }> => {
    const r = await call(E.attendance.pendingApprovals, { summary: true });
    return { total: typeof r?.total === 'number' ? r.total : 0, bySpace: r?.bySpace ?? {} };
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
    return call(E.attendance.editEntry, { id: entryId }, { body });
  },

  /** Scheduled shifts nobody clocked in for (`canViewSpaceAttendance`). */
  listNoShows: async (days = 7): Promise<NoShow[]> => {
    const result = await call(E.attendance.noShows, { days });
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /** Excuse a no-show, or put it back on the list (`canReconcileAttendance`). */
  resolveNoShow: async (id: string, action: 'excuse' | 'reopen', reason?: string): Promise<NoShow> => {
    return call(E.attendance.resolveNoShow, { id }, { body: { action, reason } });
  },

  // ── Shift reminder responses ──────────────────────────────────────────────

  /** "I forgot to clock out" — self-report the real leave time (ISO string). */
  resolveForgotClockOut: async (entryId: string, clockOutAt: string): Promise<TimeEntry> => {
    return call(E.attendance.forgotClockOut, { id: entryId }, { body: { clockOutAt } });
  },

  /** "I'm working extra time" — routes to a space leader for approval. */
  requestExtraTime: async (entryId: string): Promise<{ entryId: string; status: string }> => {
    return call(E.attendance.requestExtraTime, { id: entryId });
  },

  /** Leader: open extra-time requests the caller can approve. */
  getPendingExtraTime: async (): Promise<TimeEntry[]> => {
    const result = await call(E.attendance.extraTimePending);
    if (Array.isArray(result)) return result;
    return result?.data ?? [];
  },

  /** Leader: approve N more minutes of overtime for an open shift. */
  approveExtraTime: async (entryId: string, minutes: number): Promise<any> => {
    return call(E.attendance.approveExtraTime, { id: entryId }, { body: { minutes } });
  },

  /** Leader: reject an extra-time request. */
  rejectExtraTime: async (entryId: string): Promise<any> => {
    return call(E.attendance.rejectExtraTime, { id: entryId });
  },
};
