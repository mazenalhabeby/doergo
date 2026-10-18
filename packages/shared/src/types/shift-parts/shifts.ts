/** Moved here unchanged from shift.ts. */
import { ShiftRecurrence } from '../enums';

// ============================================================================
// SHIFT DEFINITION
// ============================================================================

// A single named shift window. Times are LOCAL to the space's timezone.
// A shift crosses midnight when endLocal <= startLocal (e.g. 22:00 → 06:00).
export interface Shift {
  id: string;
  organizationId: string;
  spaceId: string | null; // null = org-wide, reusable across spaces
  name: string;
  description?: string | null;
  color?: string | null;
  startLocal: string; // "22:00"
  endLocal: string; // "06:00"
  crossesMidnight: boolean;
  breakMinutes: number; // Unpaid break subtracted from expected duration
  graceMin: number; // Minutes after end before the first reminder fires
  reminderIntervalMin: number; // Gap between subsequent reminders
  maxReminders: number; // Reminders before escalating to a space leader
  flagToleranceMin: number; // Grace before LATE_ARRIVAL / EARLY_DEPARTURE / OVERTIME
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShiftInput {
  spaceId?: string | null;
  name: string;
  description?: string;
  color?: string;
  startLocal: string;
  endLocal: string;
  breakMinutes?: number;
  graceMin?: number;
  reminderIntervalMin?: number;
  maxReminders?: number;
  flagToleranceMin?: number;
}

// True when a shift's local end time is at/before its start → it crosses midnight.
export function shiftCrossesMidnight(startLocal: string, endLocal: string): boolean {
  return endLocal <= startLocal;
}

// ============================================================================
// SHIFT ASSIGNMENT (ROTA)
// ============================================================================

// Assigns a member to a shift within a space on a recurrence. Effective-dated:
// editing/deleting closes the current row (effectiveTo) instead of destroying
// history, so past attendance stays intact.
export interface ShiftAssignment {
  id: string;
  organizationId: string;
  userId: string;
  spaceId: string;
  shiftId: string;
  recurrence: ShiftRecurrence;
  daysOfWeek: number[]; // WEEKLY: 0=Sun..6=Sat
  daysOfMonth: number[]; // MONTHLY: 1..31
  dates: string[]; // ONE_OFF: explicit ISO dates
  effectiveFrom: string;
  effectiveTo?: string | null; // null = open-ended
  priority: number; // Higher wins when assignments overlap
  isActive: boolean;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated relations (optional)
  shift?: Pick<Shift, 'id' | 'name' | 'startLocal' | 'endLocal' | 'crossesMidnight' | 'color'>;
  user?: { id: string; firstName: string; lastName: string; email?: string };
}

export interface CreateShiftAssignmentInput {
  userId: string;
  spaceId: string;
  shiftId: string;
  recurrence: ShiftRecurrence;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  dates?: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  priority?: number;
}
