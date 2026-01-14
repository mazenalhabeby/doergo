// User Roles
export enum Role {
  PARTNER = 'PARTNER',
  OFFICE = 'OFFICE',
  WORKER = 'WORKER',
}

// Task Status - follows the lifecycle: DRAFT → NEW → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
export enum TaskStatus {
  DRAFT = 'DRAFT',
  NEW = 'NEW',
  ASSIGNED = 'ASSIGNED',
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
