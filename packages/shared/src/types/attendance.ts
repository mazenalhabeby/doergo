/**
 * Shared Attendance Types
 * These types are used by both web and mobile apps to ensure consistency.
 * Import from '@hbcfield/shared' instead of redefining in each app.
 */

import { TimeEntryStatus, BreakType, ApprovalStatus } from './enums';

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
  expectedClockOutAt?: string | null;
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
