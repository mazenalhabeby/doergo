/** Rests, the bodies the apps send, the query parameters and the report shapes. */
import { BreakType, TimeEntryStatus } from '../enums';
import type { TimeEntry } from './entry';
import type { CompanyLocation } from './location';
import type { PaginationMeta } from '../../api/responses';

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
  /**
   * AUTO = made by the automatic clock (attendance/auto-clock.ts). The server re-checks it;
   * not allowed → recorded as a manual clock-in.
   */
  trigger?: 'MANUAL' | 'AUTO';
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
  /** AUTO = made by the automatic clock on leaving the area; re-checked by the server like a clock-in. */
  trigger?: 'MANUAL' | 'AUTO';
  /** Why they stayed past the shift end — sent with a late clock-out, it asks a leader for the overtime. */
  overtimeReason?: string;
  /**
   * "What I did and what is left", per job still in work — the clock-out pauses
   * those jobs either way (tasks/handover.ts). Optional: never a gate.
   */
  handovers?: ClockOutHandoverInput[];
}

/** One job's note, written in the clock-out sheet. */
export interface ClockOutHandoverInput {
  /** Made on the phone, so a replay writes it once. */
  id?: string;
  taskId: string;
  note: string;
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

// ============================================================================
// PAGINATED RESPONSE
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  /** The same shape `paginated()` builds (api/responses.ts). */
  meta: PaginationMeta;
}
