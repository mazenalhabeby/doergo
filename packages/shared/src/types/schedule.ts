import { TimeOffStatus } from './enums';

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Weekly recurring schedule entry (one per day per worker) */
export interface ScheduleEntry {
  id: string;
  technicianId: string;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  startTime: string; // "HH:MM" 24h format
  endTime: string;   // "HH:MM" 24h format
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating/updating a schedule entry */
export interface ScheduleEntryInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIME-OFF TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Time-off request */
export interface TimeOffRequest {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: TimeOffStatus;
  approvedById?: string | null;
  approvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  /** What it costs the allowance — weekends, rota rest days and holidays left out (calendar/days.ts). Null on old rows. */
  workingDays?: number | null;
  /** What is asked (requests/request-kinds.ts). Absent on old rows = LEAVE. */
  kind?: import('../requests/request-kinds').RequestKind;
  /** LEAVE: VACATION | SICK | FAMILY | OTHER. */
  type?: string | null;
  /** REMOTE (required) / HOURS / OVERTIME / OTHER: the workspace it is about. */
  spaceId?: string | null;
  space?: { id: string; name: string } | null;
  /** HOURS: the day's new start / end, HH:MM local. */
  startTime?: string | null;
  endTime?: string | null;
  /** OVERTIME: minutes agreed in advance. */
  minutes?: number | null;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AVAILABILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════════
// Note: EmployeeAvailability is defined in ./technician.ts to avoid duplicates

import type { EmployeeAvailability } from './technician';

/** Availability response for a single date */
export interface AvailabilityResponse {
  date: string;
  dayOfWeek: number;
  dayName: string;
  technicians: EmployeeAvailability[];
  summary: {
    total: number;
    available: number;
    onTimeOff: number;
    notScheduled: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Validate time format (HH:MM, 24-hour) */
export function isValidTimeFormat(time: string): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return !!match;
}
