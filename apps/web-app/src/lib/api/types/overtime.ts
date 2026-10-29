

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
  technician?: { id: string; firstName: string; lastName: string; email?: string; avatarUrl?: string | null };
  location?: { id: string; name: string; timezone?: string | null };
  approvedBy?: { id: string; firstName: string; lastName: string };
  /** Which round on its shift: 1, 2, 3… */
  cycle?: number;
  /** A later round on the same shift took over — this one's window is over. */
  superseded?: boolean;
  approverNotes?: string | null;
  timeEntry?: { clockInAt: string; clockOutAt: string | null; shift?: { flagToleranceMin: number | null } | null };
}

/** One round in full (GET /overtime/:id): its shift's other rounds and the signature. */
export interface OvertimeRoundDetail extends OvertimeRequest {
  technicianTimeoutAt?: string | null;
  approvalTimeoutAt?: string | null;
  signature: string | null;
  rounds: { id: string; cycle: number; status: string; agreed: number; worked: number; overBy: number }[];
}


/** The paging envelope every list endpoint returns alongside its rows. */
export interface PaginationMeta {
  total: number;
  page: number;
  limit?: number;
  totalPages: number;
}
