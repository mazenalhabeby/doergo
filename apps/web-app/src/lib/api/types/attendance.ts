import type { TimeEntry, TimeEntryStatus } from '@hbcfield/shared/client';

// Web-specific BreakSummary (different structure from shared)
export interface BreakSummary {
  totalBreaks: number;
  totalBreakMinutes: number;
  averageBreakMinutes: number;
  breaksByType: {
    LUNCH: { count: number; totalMinutes: number; averageMinutes: number };
    SHORT: { count: number; totalMinutes: number; averageMinutes: number };
    OTHER: { count: number; totalMinutes: number; averageMinutes: number };
  };
}


export interface AttendanceSummary {
  period: {
    startDate: string;
    endDate: string;
    workDays: number;
  };
  summary: {
    totalHours: number;
    totalShifts: number;
    activeShifts: number;
    autoClockOuts: number;
    standardHours: number;
    overtimeHours: number;
    averageShiftHours: number;
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
    autoClockOuts: number;
    locations: string[];
    averageShiftHours: number;
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


export interface AttendanceQueryParams {
  locationId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: TimeEntryStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}


export interface AttendanceListResponse {
  success: boolean;
  data: TimeEntry[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}


// One row in a time entry's edit history (per-edit audit record).
export interface EntryEditChange {
  field: string; // "clockInAt" | "clockOutAt" | "notes" | "timezone"
  from: string | null;
  to: string | null;
}

export interface EntryEditHistoryItem {
  id: string;
  editedAt: string;
  editor: string | null;
  reason: string | null;
  changes: EntryEditChange[];
}


// Attendance API methods (ADMIN/DISPATCHER only)
export interface NoShowRow {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  spaceId: string;
  spaceName: string;
  expectedClockInAt: string;
  expectedClockOutAt: string;
  state: "REMINDED" | "ESCALATED" | "EXCUSED";
  reminderCount: number;
  localDate: string;
  excuseReason?: string | null;
}


export interface BreakRuleRow {
  id: string;
  spaceId: string | null;
  shiftId: string | null;
  name: string;
  /** At a wall-clock time, or a number of minutes into the shift. */
  trigger: 'LOCAL_WINDOW' | 'AFTER_WORKED';
  afterMinutes: number | null;
  earliestLocal: string | null;
  latestLocal: string | null;
  durationMinutes: number;
  /** Paid rests do not come off the counted time. */
  isPaid: boolean;
  /** A missed required rest flags the entry. It never deducts. */
  isRequired: boolean;
  remind: boolean;
  snoozeMin: number;
  maxSnoozes: number | null;
  isActive: boolean;
  position: number;
}


/** One planned rest on one shift, as the server froze it at clock-in. */
export interface BreakPlanRow {
  ruleId: string;
  name: string;
  dueAt: string;
  expiresAt: string | null;
  durationMinutes: number;
  isPaid: boolean;
  required: boolean;
  state: 'PENDING' | 'SNOOZED' | 'TAKEN' | 'MISSED';
  snoozeCount: number;
  breakId?: string;
  takenAt?: string;
}


/** An org-assignable role (Admin, Manager, or a custom role). */
/** One break on a shift. `addedBy` is null when the member recorded it themselves. */
export interface EntryBreak {
  id: string;
  type: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  reason?: string | null;
  addedBy?: { id: string; firstName: string; lastName: string } | null;
}
