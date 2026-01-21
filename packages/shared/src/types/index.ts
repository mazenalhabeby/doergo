// User Roles (Field Service Industry Standard)
export enum Role {
  CLIENT = 'CLIENT',           // Was: PARTNER - Creates tasks (external customer)
  DISPATCHER = 'DISPATCHER',   // Was: OFFICE - Assigns workers, monitors operations
  TECHNICIAN = 'TECHNICIAN',   // Was: WORKER - Executes tasks in the field
}

// Legacy role aliases for backward compatibility during migration
// TODO: Remove after all references are updated
export const LegacyRoleMap = {
  PARTNER: Role.CLIENT,
  OFFICE: Role.DISPATCHER,
  WORKER: Role.TECHNICIAN,
} as const;

// Access level for organization delegation (SaaS multi-tenant)
export enum AccessLevel {
  NONE = 'NONE',                 // No access - manager sees nothing
  TASKS_ONLY = 'TASKS_ONLY',     // Can view tasks only
  TASKS_ASSIGN = 'TASKS_ASSIGN', // Can view tasks + assign workers
  FULL = 'FULL',                 // Can view everything + assign
}

// Task Status - follows the lifecycle: DRAFT → NEW → ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED → CLOSED
export enum TaskStatus {
  DRAFT = 'DRAFT',
  NEW = 'NEW',
  ASSIGNED = 'ASSIGNED',
  ACCEPTED = 'ACCEPTED',       // Technician acknowledges the assigned task
  EN_ROUTE = 'EN_ROUTE',       // Technician is traveling to the job location
  ARRIVED = 'ARRIVED',         // Technician has arrived at the location
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED',
  CLOSED = 'CLOSED',
}

// Task Priority
export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

// Task Event Types for activity timeline
export enum TaskEventType {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  ASSIGNED = 'ASSIGNED',
  UNASSIGNED = 'UNASSIGNED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  COMMENT_ADDED = 'COMMENT_ADDED',
  ATTACHMENT_ADDED = 'ATTACHMENT_ADDED',
  ATTACHMENT_REMOVED = 'ATTACHMENT_REMOVED',
}

// Attachment Types
export enum AttachmentType {
  IMAGE = 'IMAGE',
  DOCUMENT = 'DOCUMENT',
  OTHER = 'OTHER',
}

// Socket.IO Events
export const SocketEvents = {
  // Task events
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_ASSIGNED: 'task.assigned',
  TASK_STATUS_CHANGED: 'task.statusChanged',
  TASK_COMMENT_ADDED: 'task.commentAdded',
  TASK_ATTACHMENT_ADDED: 'task.attachmentAdded',
  // Worker events
  WORKER_LOCATION_UPDATED: 'worker.locationUpdated',
} as const;

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// Pagination params
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Base entity interface
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// User interface
export interface User extends BaseEntity {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string;
  isActive: boolean;
}

// Organization interface
export interface Organization extends BaseEntity {
  name: string;
  isActive: boolean;
}

// Organization Access (delegation between orgs)
export interface OrganizationAccess extends BaseEntity {
  grantorOrgId: string;    // The org granting access
  granteeOrgId: string;    // The org receiving access
  accessLevel: AccessLevel;
  canViewTasks: boolean;
  canAssignWorkers: boolean;
  canViewWorkers: boolean;
  canViewTracking: boolean;
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
  dueDate?: Date;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
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
