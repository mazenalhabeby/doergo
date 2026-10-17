/** Custom workflows, custom fields, recurring tasks, and the legacy permission schema. */
import { CustomFieldType, RecurrenceFrequency, TaskPriority } from '../enums';
import type { BaseEntity } from './api-user';

// ==================== CUSTOM WORKFLOWS ====================

// Status Workflow interface
export interface StatusWorkflow extends BaseEntity {
  organizationId: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  statuses?: WorkflowStatus[];
  _count?: { tasks?: number };
}

// Workflow Status interface (individual status within a workflow)
export interface WorkflowStatus {
  id: string;
  workflowId: string;
  name: string;
  key: string;
  color: string;
  icon?: string;
  position: number;
  isFinal: boolean;
  isCanceled: boolean;
  transitions: string[];
  createdAt: Date;
}

// ==================== CUSTOM FIELDS ====================

// Custom Field Definition interface
export interface CustomFieldDefinition extends BaseEntity {
  organizationId: string;
  name: string;
  key: string;
  type: CustomFieldType;
  options?: unknown; // JSON: string[] for DROPDOWN
  isRequired: boolean;
  position: number;
  isActive: boolean;
}

// Custom Field Value interface
export interface CustomFieldValue {
  id: string;
  definitionId: string;
  taskId: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
  definition?: CustomFieldDefinition;
}

// ==================== RECURRING TASKS ====================

// Recurring Task Template interface
export interface RecurringTaskTemplate extends BaseEntity {
  organizationId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assigneeIds?: string[];
  estimatedHours?: number;
  checklist?: { text: string }[];
  frequency: RecurrenceFrequency;
  customDays?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: Date;
  endDate?: Date;
  lastGeneratedAt?: Date;
  nextRunAt?: Date;
  isActive: boolean;
  createdById: string;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

// ==================== CUSTOM ROLES & PERMISSIONS ====================

// Only the permissions that are actually ENFORCED server-side (mapped to User
// columns and checked by the permissions guard) live here, so every toggle in
// the UI is real. Reach/scope (platform, space visibility, collaboration) and
// feature tabs are NOT permissions — they live on the per-user Access Profile.
export const PERMISSION_SCHEMA = [
  { group: 'Tasks', permissions: [
    { key: 'canCreateTasks', label: 'Create tasks', description: 'Can create new tasks' },
    { key: 'canViewAllTasks', label: 'View all tasks', description: 'Can see all tasks in the organization' },
    { key: 'canAssignTasks', label: 'Assign tasks', description: 'Can assign tasks to team members' },
  ]},
  { group: 'Team', permissions: [
    { key: 'canManageUsers', label: 'Manage members', description: 'Can add, edit, and remove team members' },
  ]},
] as const;

export type PermissionKey = (typeof PERMISSION_SCHEMA)[number]['permissions'][number]['key'];
