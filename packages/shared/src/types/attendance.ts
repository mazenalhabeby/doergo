/**
 * Shared Attendance Types
 * These types are used by both web and mobile apps to ensure consistency.
 * Import from '@hbcfield/shared' instead of redefining in each app.
 */

import { TimeEntryStatus, BreakType, ApprovalStatus } from './enums';
import type { NoShiftTag } from '../attendance/no-shift-limit';

// ============================================================================
// COMPANY LOCATION
// ============================================================================

export interface CompanyLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  geofenceRadius: number;
  /**
   * The site's drawn outline, when one exists. Present on the type so every
   * client can ask `isAtSite` the same question the server asks — a client that
   * only knows about the radius shows "out of range" to somebody the server is
   * happily accepting, which is worse than showing nothing.
   */
  geofencePolygon?: { lat: number; lng: number }[] | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
  // Space configuration
  enabledModules?: string[] | null;
  workflowId?: string | null;
  workModel?: string | null; // NONE | SHIFT | FIXED | TASK — how attendance is interpreted
  // Ownership classification — PROJECT | COMPANY | CUSTOMER (orthogonal to
  // physical-vs-workspace). CUSTOMER spaces carry the contact fields below.
  kind?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  // CUSTOMER kind: per-space billable rate override (EUR cents/hour; null =
  // fall back to the org default). Used to auto-price invoice labor lines.
  billableRateCents?: number | null;
  // Space-driven routing (Phase 3): role ids notified about / contactable by
  // members here. Empty = default to the space's leader roles.
  notifyRoleIds?: string[] | null;
  contactRoleIds?: string[] | null;
  // Structural flags — the default bucket (unassigned tasks) and the Remote
  // bucket (WFH clock-ins) can't be deleted.
  isDefault?: boolean;
  isRemote?: boolean;
  // Present on the single-space detail response (findOne includes _count).
  _count?: { tasks: number };
  /**
   * The ceiling on working away from this site: STRICT | AWAY_ALLOWED | NONE.
   *
   * A fact about the place, never a permission — see
   * packages/shared/src/attendance/away-policy.ts.
   */
  geofencePolicy?: string | null;
  /**
   * The staffing floor: how many people must be on the floor here on a working
   * day. 0 means NOT SET, never "nobody needed" — with no floor the leave chart
   * reports the count and passes no judgement on it.
   */
  minCover?: number;
  /**
   * Whether the CALLER may clock in here without being on site.
   *
   * Only present on the clock-in list, where the server answers it with the
   * same rule the clock-in refuses by — the site's ceiling and this member's
   * grant. Undefined elsewhere: it is a fact about a person and a place
   * together, not a property of the place.
   */
  awayAllowed?: boolean;
  /** Clocking in here with no shift: ALLOW | LIMIT | SHIFT_ONLY — see attendance/no-shift-limit.ts. */
  noShiftPolicy?: string | null;
  noShiftDailyMinutes?: number | null;
  /**
   * The caller's allowance here with no shift, as the server read it. Only on
   * the clock-in list and status; null where the workspace allows it freely.
   */
  noShift?: NoShiftTag | null;
  /** On the clock-in list and status: a shift for the caller here now, and their primary workspace. */
  shiftToday?: boolean;
  isPrimary?: boolean;
}

// ============================================================================
// TIME ENTRY (Clock-in/Clock-out)
// ============================================================================

export interface TimeEntry {
  id: string;
  userId: string;
  locationId: string;
  status: TimeEntryStatus;
  clockInAt: string;
  clockInLat: number;
  clockInLng: number;
  clockInAccuracy: number | null;
  clockOutAt: string | null;
  clockOutLat: number | null;
  clockOutLng: number | null;
  clockOutAccuracy: number | null;
  clockInWithinGeofence: boolean;
  clockOutWithinGeofence: boolean | null;
  // Remote work (WFH/anywhere): geofence-exempt, coarse place captured from GPS
  isRemote?: boolean;
  clockInPlace?: string | null;
  clockOutPlace?: string | null;
  // IANA timezone where the worker clocked in (GPS-derived; space-tz fallback).
  timezone?: string | null;
  totalMinutes: number | null;
  breakMinutes: number;
  /** Of those, the minutes that do not count as work. */
  unpaidBreakMinutes?: number;
  /*
    The second clock: what the timesheet counts, as opposed to what happened.

    `clockInAt`/`clockOutAt` above are evidence and are never adjusted. These are
    the same day seen by payroll — an early arrival clamped off, approved
    overtime included, unpaid rests subtracted — decided ONCE at clock-out by the
    shared counted-time rule. Null on entries closed before that rule existed,
    and on shifts still running.
  */
  countedStartAt?: string | null;
  countedEndAt?: string | null;
  paidMinutes?: number | null;
  notes: string | null;
  flagReasons: string[];
  approvalStatus: ApprovalStatus;
  approvedById: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;
  isEdited: boolean;
  editedById: string | null;
  editedAt: string | null;
  originalClockIn: string | null;
  originalClockOut: string | null;
  editReason: string | null;
  // Populated when an admin edited the entry — drives the "Edited" badge details.
  editedBy?: { firstName: string; lastName: string } | null;
  // Shift expectation (space-centric attendance). Set at clock-in for shift/fixed
  // spaces; drives the reminder engine. null on task/none spaces.
  shiftId?: string | null;
  expectedClockInAt?: string | null;
  expectedClockOutAt?: string | null;
  /** The planned end is the workspace's daily limit for clocking in with no shift, not a shift end. */
  endIsDailyLimit?: boolean;
  /** Where they are working now: ON_SITE | FIELD | REMOTE — see attendance/presence.ts. Null on older entries. */
  presence?: string | null;
  presenceReason?: string | null;
  presenceAt?: string | null;
  /** Last position heard from the phone; null when it never sent one (a computer). */
  lastSeenAt?: string | null;
  /*
    This shift's planned rests, frozen at clock-in. Loosely typed here on
    purpose: the shape is owned and validated by
    packages/shared/src/attendance/break-plan.ts, and a second definition on the
    client is a second place for it to be wrong.
  */
  breakPlan?: unknown;
  nextBreakRemindAt?: string | null;
  /** The rest in progress, when the status endpoint was asked. */
  breaks?: Array<{
    id: string;
    startedAt: string;
    endedAt?: string | null;
    ruleId?: string | null;
    isPaid?: boolean;
    type?: string;
  }>;
  reminderState?: 'NONE' | 'REMINDED' | 'OVERTIME_PENDING' | 'OVERTIME_APPROVED' | 'ESCALATED' | 'RESOLVED';
  nextRemindAt?: string | null;
  reminderCount?: number;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
  // Populated relations
  location?: CompanyLocation;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
}

export interface AttendanceStatus {
  isClockedIn: boolean;
  currentEntry: TimeEntry | null;
  assignedLocations: CompanyLocation[];
  // The current session's active "out of ring" excursion, if any (drives the
  // mobile warning sheet / countdown). Null when inside the ring or not clocked in.
  activeExcursion?: GeofenceExcursion | null;
  /**
   * The member's latest shift closed automatically with a temporary time
   * because it was left open — "when did you actually leave?". Null when none.
   */
  unconfirmedClockOut?: UnconfirmedClockOut | null;
}

/** A shift left open and closed with a temporary clock-out, waiting for the member's real time. */
export interface UnconfirmedClockOut {
  id: string;
  clockInAt: string | Date;
  clockOutAt: string | Date;
  /** LEFT_SITE | SHIFT_END | CLOCK_IN_PLUS_8H */
  clockOutBasis: string | null;
  expectedClockOutAt: string | Date | null;
  timezone: string | null;
  location: { id: string; name: string; timezone?: string | null } | null;
}

// ============================================================================
// GEOFENCE EXCURSION ("OUT OF RING")
// ============================================================================

export type GeofenceExcursionStatus =
  | 'OUT_UNREPORTED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'EXPIRED';

export interface GeofenceExcursion {
  id: string;
  organizationId: string;
  timeEntryId: string;
  userId: string;
  spaceId: string;
  status: GeofenceExcursionStatus;
  reason: string | null;
  requestedMinutes: number | null;
  grantedMinutes: number | null;
  leftRingAt: string;
  reportedAt: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  resolvedAt: string | null;
  approvedById: string | null;
  timerExpired: boolean;
  lastDistanceM: number | null;
  createdAt: string;
  updatedAt: string;
  // Populated relations (approver surface)
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  space?: Pick<CompanyLocation, 'id' | 'name'> | null;
}

export interface ReportExcursionInput {
  reason: string;
  requestedMinutes: number;
}

export interface ApproveExcursionInput {
  grantedMinutes?: number;
}

// ============================================================================
// BREAKS
// ============================================================================

export interface Break {
  id: string;
  timeEntryId: string;
  type: BreakType;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  /**
   * Who entered this break on the member's behalf, and why.
   *
   * NULL — almost every break — means the member recorded it themselves on their
   * phone. A populated `addedBy` says somebody else added it after the fact,
   * which changed that member's paid hours, so the two must never look alike.
   */
  addedById?: string | null;
  addedBy?: { id: string; firstName: string; lastName: string } | null;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated relations
  timeEntry?: TimeEntry;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  location?: CompanyLocation;
}

export interface BreakStatus {
  isClockedIn: boolean;
  isOnBreak: boolean;
  currentBreak: Break | null;
  todayBreaks: Break[];
  totalBreakMinutes: number;
}

export interface BreakSummary {
  period: {
    startDate: string;
    endDate: string;
  };
  totalBreaks: number;
  totalBreakMinutes: number;
  averageBreakMinutes: number;
  breaksByType: {
    [K in BreakType]: {
      count: number;
      totalMinutes: number;
      averageMinutes: number;
    };
  };
}

// ============================================================================
// INPUT DTOs (for API calls)
// ============================================================================

export interface ClockInInput {
  // On-site clock-in supplies a locationId; a remote-eligible member instead
  // sends isRemote:true with no locationId (geofence-exempt). Exactly one applies.
  locationId?: string;
  isRemote?: boolean;
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface ClockOutInput {
  // Optional: a device with no GPS fix (indoors, permission just revoked) can
  // still clock OUT — the geofence check is simply skipped, coords stored null,
  // rather than falling back to (0,0) which faked an OUTSIDE_GEOFENCE_OUT flag.
  lat?: number;
  lng?: number;
  accuracy?: number;
  notes?: string;
  /**
   * Why they are leaving before the shift ends.
   *
   * Sent when the member confirmed a short clock-out. The server measures the
   * shortfall itself and never refuses the clock-out for want of a reason — the
   * client asking is a courtesy, not a gate.
   */
  earlyReason?: string;
  /** Why they stayed past the shift end — sent with a late clock-out, it asks a leader for the overtime. */
  overtimeReason?: string;
}

export interface StartBreakInput {
  type?: BreakType;
  notes?: string;
}

export interface EndBreakInput {
  notes?: string;
}

// ============================================================================
// QUERY PARAMS
// ============================================================================

export interface AttendanceHistoryParams {
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AttendanceQueryParams {
  date?: string;
  status?: TimeEntryStatus;
  page?: number;
  limit?: number;
}

export interface BreakHistoryParams {
  date?: string;
  type?: BreakType;
  userId?: string;
  page?: number;
  limit?: number;
}

export interface BreakSummaryParams {
  startDate: string;
  endDate: string;
  userId?: string;
}

// ============================================================================
// REPORTS
// ============================================================================

export interface AttendanceSummary {
  period: {
    startDate: string;
    endDate: string;
    workDays: number;
  };
  summary: {
    totalShifts: number;
    totalHours: number;
    standardHours: number;
    overtimeHours: number;
    averageShiftHours: number;
    autoClockOuts: number;
  };
  byUser: Array<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    totalHours: number;
    shifts: number;
    averageShiftHours: number;
    autoClockOuts: number;
    locations: string[];
  }>;
  byLocation: Array<{
    location: {
      id: string;
      name: string;
    };
    totalHours: number;
    shifts: number;
    uniqueTechnicians: number;
  }>;
}

export interface CSVExportResult {
  filename: string;
  mimeType: string;
  content: string;
  recordCount: number;
}

// ============================================================================
// PAGINATED RESPONSE
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a break is currently active (not ended)
 */
export function isBreakActive(breakItem: Break): boolean {
  return breakItem.endedAt === null;
}

/**
 * Get the display name for a break type
 */
export function getBreakTypeLabel(type: BreakType): string {
  const labels: Record<BreakType, string> = {
    [BreakType.LUNCH]: 'Lunch',
    [BreakType.SHORT]: 'Short',
    [BreakType.OTHER]: 'Other',
  };
  return labels[type] || type;
}

/**
 * Get the display name for a time entry status
 */
export function getTimeEntryStatusLabel(status: TimeEntryStatus): string {
  const labels: Record<TimeEntryStatus, string> = {
    [TimeEntryStatus.CLOCKED_IN]: 'Active',
    [TimeEntryStatus.CLOCKED_OUT]: 'Completed',
    [TimeEntryStatus.AUTO_OUT]: 'Auto Clock-Out',
  };
  return labels[status] || status;
}

/**
 * May this person clock in from anywhere, without a geofence?
 *
 * ONE rule, because it had already drifted. The server has always read
 * `allowRemote || role === ADMIN` — an admin needs nothing configured, since
 * there is no one above them to grant it and the Access screen deliberately
 * offers no such switch. Every client, though, checked `allowRemote` alone.
 *
 * The result was an admin who could clock in remotely as far as the API was
 * concerned and had no button anywhere to do it with: three UIs each enforcing
 * three quarters of a rule they had copied rather than shared.
 *
 * Remote is geofence-EXEMPT, not location-free — a coarse fix is still taken and
 * reverse-geocoded to a place, because "worked from Vienna" is a record and
 * "worked from somewhere" is not. Asking for GPS on a remote clock-in is
 * correct, and is not what this decides.
 */
export function mayClockInRemotely(
  user: { allowRemote?: boolean | null; role?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  return user.allowRemote === true || user.role === 'ADMIN';
}

/**
 * The hours a shift is actually worth — clock time minus breaks.
 *
 * `TimeEntry.totalMinutes` is GROSS: clock-in to clock-out, breaks included. The
 * services store it that way on purpose, with a comment saying breaks are
 * "netted out downstream" — and nothing downstream did. Every screen showed the
 * gross figure under a heading that reads as hours worked, and the reports metric
 * labelled "Hours worked" summed it directly, so a shift of 13h05m with an hour's
 * break was reported as 13.1 hours worked rather than 12.1.
 *
 * Gross is the right thing to STORE: it is the measured fact, and breaks change
 * afterwards — one gets added, corrected, or removed, and a pre-subtracted total
 * would have to be recomputed every time or quietly drift. Netting belongs at the
 * point of reading, which is here.
 *
 * Floored at zero: a break longer than the shift is a data error, and a negative
 * number of hours worked helps nobody diagnose it.
 */
export function workedMinutes(
  entry:
    | { paidMinutes?: number | null; totalMinutes?: number | null; breakMinutes?: number | null }
    | null
    | undefined,
): number {
  /*
    The counted figure wins when there is one.

    `paidMinutes` is decided once, at clock-out, by the shared counted-time rule:
    an early arrival clamped off, approved overtime included because approving it
    moved the expected end, unpaid rests subtracted. Nothing on a screen may
    re-derive that from raw times — a second opinion about somebody's hours is
    exactly the bug this whole column exists to remove.

    The fallback is not legacy debt, it is the same arithmetic this function has
    always done: entries closed before the column existed keep reporting the
    number they always reported, on every screen, with no migration of history.
  */
  if (entry?.paidMinutes != null) return Math.max(0, entry.paidMinutes);

  const gross = entry?.totalMinutes ?? 0;
  const breaks = entry?.breakMinutes ?? 0;
  return Math.max(0, gross - breaks);
}
