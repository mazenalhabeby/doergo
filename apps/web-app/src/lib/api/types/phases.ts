

export interface Phase {
  id: string;
  name: string;
  description: string | null;
  color: string;
  type: string;
  organizationId: string;
  startDate: string | null;
  endDate: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
