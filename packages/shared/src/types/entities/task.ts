/** A task and what hangs off it: assignees, checklist, phases, sprints, epics, dependencies, comments, attachments, events. */
import { AttachmentType, DependencyType, SprintStatus, TaskEventType, TaskPriority, TaskStatus } from '../enums';
import type { BaseEntity } from './api-user';
import type { Asset } from './asset';

// Task Assignee interface (many-to-many: Task ↔ User)
export interface TaskAssignee {
  id: string;
  taskId: string;
  userId: string;
  role: import('../enums').TaskAssigneeRole;
  createdAt: Date;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
}

// Checklist Item interface
export interface ChecklistItem {
  id: string;
  taskId: string;
  text: string;
  isCompleted: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

// Task interface
export interface Task extends BaseEntity {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  organizationId: string;
  createdById: string;
  assignedToId?: string;
  assetId?: string;
  dueDate?: Date;
  startDate?: Date;
  estimatedHours?: number;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
  // Subtask hierarchy
  parentId?: string;
  depth?: number;
  position?: number;
  // Agile fields
  storyPoints?: number;
  // Phase, Sprint & Epic associations
  phaseId?: string;
  sprintId?: string;
  epicId?: string;
  // Space (CompanyLocation) association
  spaceId?: string | null;
  space?: { id: string; name: string } | null;
  // Populated relations
  asset?: Asset;
  assignees?: TaskAssignee[];
  checklistItems?: ChecklistItem[];
  subtasks?: Task[];
  parent?: { id: string; title: string };
  phase?: Phase;
  sprint?: Sprint;
  epic?: Epic;
  predecessors?: TaskDependencyWithTask[];
  successors?: TaskDependencyWithTask[];
  _count?: { subtasks?: number };
}

// Phase interface (project phase or milestone)
export interface Phase extends BaseEntity {
  name: string;
  description?: string;
  color: string;
  type: string; // "phase" or "milestone"
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
  position: number;
  isActive: boolean;
  _count?: { tasks?: number };
}

// Sprint interface (agile sprint)
export interface Sprint extends BaseEntity {
  name: string;
  goal?: string;
  organizationId: string;
  startDate: Date;
  endDate: Date;
  status: SprintStatus;
  position: number;
  tasks?: Task[];
  _count?: { tasks?: number };
}

// Epic interface (agile epic for grouping tasks)
export interface Epic extends BaseEntity {
  name: string;
  description?: string;
  color: string;
  status: string;
  organizationId: string;
  startDate?: Date;
  targetDate?: Date;
  position: number;
  tasks?: Task[];
  _count?: { tasks?: number };
}

// Sprint Report interface (generated when sprint completes)
export interface SprintReport {
  id: string;
  sprintId: string;
  organizationId: string;
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
  createdAt: string;
}

/** Fibonacci story point options */
export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21] as const;

/** Common position/title suggestions */
export const POSITION_SUGGESTIONS = [
  'Technician', 'Driver', 'Accountant', 'HR Manager', 'Sales Representative',
  'Office Manager', 'Warehouse Worker', 'Service Engineer', 'Project Manager',
  'Designer', 'Developer', 'Customer Support', 'Delivery Driver', 'Inspector',
] as const;

// Task Dependency interface
export interface TaskDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
  createdAt: Date;
}

// Task Dependency with populated task info
export interface TaskDependencyWithTask extends TaskDependency {
  predecessor?: { id: string; title: string; status: TaskStatus };
  successor?: { id: string; title: string; status: TaskStatus };
}

// Comment interface
export interface Comment extends BaseEntity {
  taskId: string;
  userId: string;
  content: string;
}

// Attachment interface
export interface Attachment extends BaseEntity {
  taskId: string;
  uploadedById: string;
  fileName: string;
  fileUrl: string;
  fileType: AttachmentType;
  fileSize: number;
}

// Task Event interface (for activity timeline)
export interface TaskEvent extends BaseEntity {
  taskId: string;
  userId: string;
  eventType: TaskEventType;
  metadata?: Record<string, unknown>;
}

// Worker Location interface
export interface WorkerLocation {
  userId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: Date;
}
