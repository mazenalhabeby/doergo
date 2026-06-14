export class GetEmployeeStatsDto {
  id: string;
  organizationId: string;
}

export class GetEmployeePerformanceDto {
  id: string;
  organizationId: string;
  startDate?: string;
  endDate?: string;
}

export class GetEmployeeTaskHistoryDto {
  id: string;
  organizationId: string;
  status?: string;
  page?: number;
  limit?: number;
}

// ===========================
// Schedule DTOs
// ===========================

export interface ScheduleEntryInput {
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  isActive?: boolean;
  notes?: string;
}

export class SetScheduleDto {
  technicianId: string;
  organizationId: string;
  requesterId: string;
  schedule: ScheduleEntryInput[];
}

export class GetScheduleDto {
  technicianId: string;
  organizationId: string;
}

// ===========================
// Time-Off DTOs
// ===========================

export class RequestTimeOffDto {
  technicianId: string;
  organizationId: string;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  reason?: string;
}

export class GetTimeOffDto {
  technicianId: string;
  organizationId: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
}

export class GetOrgTimeOffDto {
  organizationId: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
}

export class ApproveTimeOffDto {
  timeOffId: string;
  organizationId: string;
  approverId: string;
  approved: boolean;
  rejectionReason?: string;
}

export class CancelTimeOffDto {
  timeOffId: string;
  technicianId: string;
}

// ===========================
// Availability DTOs
// ===========================

export class GetAvailabilityDto {
  organizationId: string;
  date?: string; // Specific date (defaults to today)
  startDate?: string; // For range query
  endDate?: string; // For range query
}

// Backward-compatible aliases for internal message patterns
export type GetTechnicianStatsDto = GetEmployeeStatsDto;
export type GetTechnicianPerformanceDto = GetEmployeePerformanceDto;
export type GetTechnicianTaskHistoryDto = GetEmployeeTaskHistoryDto;
