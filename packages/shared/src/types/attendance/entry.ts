/** A shift as recorded, the caller's status, and time spent outside the ring. */
import { ApprovalStatus, TimeEntryStatus } from '../enums';
import type { CompanyLocation } from './location';

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
  /** On `/attendance/history` only: how many work-log notes the shift carries. */
  _count?: { workLog?: number };
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
  /** LEFT_SITE | LAST_SEEN | SHIFT_END | CLOCK_IN_PLUS_8H (the workspace's hours without a shift, despite the name) */
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
