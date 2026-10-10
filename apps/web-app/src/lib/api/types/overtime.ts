

// ============================================================================
// OVERTIME API
// ============================================================================

export interface OvertimeRequest {
  id: string;
  technicianId: string;
  timeEntryId: string;
  locationId: string;
  status: string;
  technicianRespondedAt?: string;
  technicianReason?: string;
  approvalMethod?: string;
  approvedById?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  leaderName?: string;
  leaderSignature?: string;
  maxDurationMinutes?: number;
  overtimeStartAt?: string;
  overtimeEndAt?: string;
  actualEndAt?: string;
  overtimeMinutes?: number;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  technician?: { id: string; firstName: string; lastName: string; email?: string };
  location?: { id: string; name: string };
  approvedBy?: { id: string; firstName: string; lastName: string };
}


/** The paging envelope every list endpoint returns alongside its rows. */
export interface PaginationMeta {
  total: number;
  page: number;
  limit?: number;
  totalPages: number;
}
