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

/** Reusable schedule template */
export interface ScheduleTemplate {
  id: string;
  name: string;           // "Morning Shift", "Night Shift", etc.
  description?: string;
  entries: ScheduleEntryInput[];
  organizationId: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a schedule template */
export interface CreateScheduleTemplateInput {
  name: string;
  description?: string;
  entries: ScheduleEntryInput[];
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
  createdAt: string;
  updatedAt: string;
}

/** Input for requesting time off */
export interface RequestTimeOffInput {
  startDate: string;
  endDate: string;
  reason?: string;
}

/** Input for approving/rejecting time off */
export interface ApproveTimeOffInput {
  approved: boolean;
  rejectionReason?: string;
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
// COVERAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Coverage gap — a date where a worker is off and no replacement is assigned */
export interface CoverageGap {
  date: string;
  workerOff: {
    id: string;
    firstName: string;
    lastName: string;
  };
  timeOff: {
    id: string;
    startDate: string;
    endDate: string;
    reason?: string;
  };
  availableReplacements: {
    id: string;
    firstName: string;
    lastName: string;
  }[];
}

/** Time-off conflict — when a request overlaps with existing approved time-off for the same period */
export interface TimeOffConflict {
  type: 'OVERLAP' | 'COVERAGE_GAP' | 'MULTIPLE_OFF';
  message: string;
  affectedDates: string[];
  details?: {
    existingTimeOff?: TimeOffRequest;
    otherWorkersOff?: string[];
    coveragePercent?: number;
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

/** Validate schedule entry times are logical */
export function isValidScheduleEntry(entry: ScheduleEntryInput): { valid: boolean; error?: string } {
  if (entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
    return { valid: false, error: 'dayOfWeek must be 0-6' };
  }
  if (!isValidTimeFormat(entry.startTime)) {
    return { valid: false, error: `Invalid start time format: ${entry.startTime}` };
  }
  if (!isValidTimeFormat(entry.endTime)) {
    return { valid: false, error: `Invalid end time format: ${entry.endTime}` };
  }
  if (entry.startTime >= entry.endTime) {
    return { valid: false, error: 'Start time must be before end time' };
  }
  return { valid: true };
}

/** Check if two date ranges overlap */
export function dateRangesOverlap(
  startA: string | Date,
  endA: string | Date,
  startB: string | Date,
  endB: string | Date,
): boolean {
  const a1 = new Date(startA).getTime();
  const a2 = new Date(endA).getTime();
  const b1 = new Date(startB).getTime();
  const b2 = new Date(endB).getTime();
  return a1 <= b2 && b1 <= a2;
}

/** Get the number of days in a date range (inclusive) */
export function getDaysInRange(startDate: string | Date, endDate: string | Date): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** Day of week labels */
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
