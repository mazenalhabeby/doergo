
// ============================================================================
// Time-Off Types
// ============================================================================

export interface TimeOffRequest {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  approvedById?: string;
  approvedBy?: { id: string; firstName: string; lastName: string };
  approvedAt?: string;
  rejectionReason?: string;
  /** What is asked (shared requests/request-kinds.ts). Absent on old rows = LEAVE. */
  kind?: import('@hbcfield/shared/client').RequestKind;
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
  /** The org list brings the member with each row. */
  technician?: { id: string; firstName?: string | null; lastName?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Availability & Schedule Types
// ============================================================================

export interface TechnicianAvailability {
  id: string;
  firstName: string;
  lastName: string;
  isAvailable: boolean;
  onTimeOff: boolean;
  schedule: { startTime: string; endTime: string } | null;
  timeOff: { id: string; reason?: string } | null;
}

export interface AvailabilityResponse {
  date: string;
  dayOfWeek: number;
  dayName: string;
  technicians: TechnicianAvailability[];
  summary: { total: number; available: number; onTimeOff: number; notScheduled: number };
}

export interface ScheduleEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notes?: string;
}
