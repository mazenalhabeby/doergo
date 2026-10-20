/** The technicians module's message shapes (were classes in task-service technicians/dto). */

export interface GetEmployeeStatsMessage {
  id: string;
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
}

export interface GetEmployeePerformanceMessage {
  id: string;
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
  startDate?: string;
  endDate?: string;
}

export interface GetEmployeeTaskHistoryMessage {
  id: string;
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
  status?: string;
  page?: number;
  limit?: number;
  /** A due-date window (YYYY-MM-DD) — read by the service through a cast; declared here. */
  startDate?: string;
  endDate?: string;
}

// ===========================
// Schedule DTOs
// ===========================

export interface ScheduleEntryMessage {
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  isActive?: boolean;
  notes?: string;
}

export interface SetScheduleMessage {
  technicianId: string;
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
  requesterId: string;
  schedule: ScheduleEntryMessage[];
}

export interface GetScheduleMessage {
  technicianId: string;
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
}

// ===========================
// Time-Off DTOs
// ===========================

export interface RequestTimeOffMessage {
  /** Made on the phone: a request sent twice is still one request. */
  id?: string;
  technicianId: string;
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
  /** The request as sent — read ONLY through the shared `parseRequestInput` (requests/request-kinds.ts). */
  kind?: string;
  startDate: string; // ISO date string
  endDate?: string; // ISO date string; absent = the start day
  reason?: string;
  type?: string;
  spaceId?: string;
  startTime?: string;
  endTime?: string;
  minutes?: number;
}

export interface GetTimeOffMessage {
  technicianId: string;
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
}

export interface GetOrgTimeOffMessage {
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  /** A window (YYYY-MM-DD, inclusive): leave touching it, plus every request still PENDING. */
  from?: string;
  to?: string;
}

export interface ApproveTimeOffMessage {
  timeOffId: string;
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
  approverId: string;
  approved: boolean;
  rejectionReason?: string;
}

export interface CancelTimeOffMessage {
  timeOffId: string;
  technicianId: string;
}

// ===========================
// Availability DTOs
// ===========================

export interface GetAvailabilityMessage {
  organizationId: string;
  /** Spaces the caller may read; undefined = org-wide, [] = none. */
  scopeSpaceIds?: string[];
  date?: string; // Specific date (defaults to today)
  startDate?: string; // For range query
  endDate?: string; // For range query
}
