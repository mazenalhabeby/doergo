import type { Task } from './tasks';

export interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  organizationId: string;
  startDate: string;
  endDate: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
  position: number;
  createdAt: string;
  updatedAt: string;
  tasks?: Task[];
}
