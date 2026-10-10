

// ============================================================================
// EPICS
// ============================================================================

export interface Epic {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: string;
  organizationId: string;
  startDate: string | null;
  targetDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}
