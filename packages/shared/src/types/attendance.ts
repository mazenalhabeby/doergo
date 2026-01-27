/**
 * Shared Attendance Types
 * These types are used by both web and mobile apps to ensure consistency.
 * Import from '@doergo/shared' instead of redefining in each app.
 */

import { TimeEntryStatus, BreakType, ApprovalStatus } from './index';

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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
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
  totalMinutes: number | null;
  breakMinutes: number;
  notes: string | null;
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
  locationId: string;
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface ClockOutInput {
  lat: number;
  lng: number;
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
