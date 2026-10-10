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


export interface SprintReport {
  id: string;
  sprintId: string;
  committedPoints: number;
  completedPoints: number;
  committedTasks: number;
  completedTasks: number;
  carriedOverTasks: number;
  carriedOverPoints: number;
  addedMidSprint: number;
  removedMidSprint: number;
  velocity: number;
  dailyBurndown: { date: string; remaining: number; ideal: number }[];
}
