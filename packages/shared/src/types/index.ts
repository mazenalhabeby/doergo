// User Roles (Field Service Industry Standard)
export enum Role {
  ADMIN = 'ADMIN',             // Organization owner/admin - full control
  CLIENT = 'CLIENT',           // DEPRECATED: Use ADMIN instead (kept for backward compatibility)
  DISPATCHER = 'DISPATCHER',   // Office manager - assigns workers, monitors operations
  TECHNICIAN = 'TECHNICIAN',   // Field worker - executes tasks
}

// Platform access restriction
export enum Platform {
  WEB = 'WEB',       // Web app only
  MOBILE = 'MOBILE', // Mobile app only
  BOTH = 'BOTH',     // Both platforms
}

// Legacy role aliases for backward compatibility during migration
export const LegacyRoleMap = {
  PARTNER: Role.ADMIN,
  OFFICE: Role.DISPATCHER,
  WORKER: Role.TECHNICIAN,
  CLIENT: Role.ADMIN,  // Map old CLIENT to ADMIN
} as const;

// Helper to normalize role (handles backward compatibility)
export function normalizeRole(role: string): Role {
  if (role === 'CLIENT') return Role.ADMIN;
  return role as Role;
}

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

// Asset Status
export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  RETIRED = 'RETIRED',
}

// Report Attachment Type (for service reports)
export enum ReportAttachmentType {
  BEFORE = 'BEFORE',   // Photo taken before work started
  AFTER = 'AFTER',     // Photo taken after work completed
}

// Technician employment type for attendance tracking
export enum TechnicianType {
  FREELANCER = 'FREELANCER',   // External contractor, task-based work
  FULL_TIME = 'FULL_TIME',     // Employee assigned to company locations
}

// Time entry status for attendance tracking
export enum TimeEntryStatus {
  CLOCKED_IN = 'CLOCKED_IN',   // Currently clocked in
  CLOCKED_OUT = 'CLOCKED_OUT', // Normal clock out
  AUTO_OUT = 'AUTO_OUT',       // System auto clock-out (midnight, etc.)
}

// Break type for attendance tracking
export enum BreakType {
  LUNCH = 'LUNCH',   // Lunch break (typically 30-60 min)
  SHORT = 'SHORT',   // Short break (typically 10-15 min)
  OTHER = 'OTHER',   // Other break type
}

// Time entry approval status
export enum ApprovalStatus {
  PENDING = 'PENDING',    // Awaiting manager review
  APPROVED = 'APPROVED',  // Manager approved
  REJECTED = 'REJECTED',  // Manager rejected
  AUTO = 'AUTO',          // Auto-approved
}

// Socket.IO Events
export const SocketEvents = {
  // Task events
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_ASSIGNED: 'task.assigned',
  TASK_DECLINED: 'task.declined',
  TASK_STATUS_CHANGED: 'task.statusChanged',
  TASK_COMMENT_ADDED: 'task.commentAdded',
  TASK_ATTACHMENT_ADDED: 'task.attachmentAdded',
  // Worker events
  WORKER_LOCATION_UPDATED: 'worker.locationUpdated',
  // Attendance events
  CLOCK_IN: 'attendance.clockIn',
  CLOCK_OUT: 'attendance.clockOut',
  // Break events
  BREAK_STARTED: 'break.started',
  BREAK_ENDED: 'break.ended',
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
  // Permission fields
  platform: Platform;
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Technician-specific fields
  technicianType?: TechnicianType;
}

// Default permissions by role
export const DEFAULT_PERMISSIONS: Record<Role, {
  platform: Platform;
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
}> = {
  [Role.ADMIN]: {
    platform: Platform.BOTH,
    canCreateTasks: true,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: true,
  },
  [Role.CLIENT]: {
    // Deprecated, same as ADMIN for backward compatibility
    platform: Platform.BOTH,
    canCreateTasks: true,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: true,
  },
  [Role.DISPATCHER]: {
    platform: Platform.WEB,
    canCreateTasks: false,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: false,
  },
  [Role.TECHNICIAN]: {
    platform: Platform.MOBILE,
    canCreateTasks: false,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  },
};

// Organization interface
export interface Organization extends BaseEntity {
  name: string;
  isActive: boolean;
}

// Company Location interface (for full-time technician attendance)
export interface CompanyLocation extends BaseEntity {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  geofenceRadius: number;
  isActive: boolean;
  organizationId: string;
}

// Technician Assignment interface (many-to-many: User ↔ CompanyLocation)
export interface TechnicianAssignment extends BaseEntity {
  userId: string;
  locationId: string;
  isPrimary: boolean;       // Main work location
  schedule: string[];       // Work days: ["MON", "TUE", "WED", "THU", "FRI"]
  effectiveFrom: Date;      // Assignment start date
  effectiveTo?: Date;       // Assignment end date (null = indefinite)
  // Populated relations
  location?: CompanyLocation;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    technicianType?: TechnicianType;
  };
}

// Break interface (breaks during a shift)
export interface Break extends BaseEntity {
  timeEntryId: string;
  type: BreakType;
  startedAt: Date;
  endedAt?: Date;
  durationMinutes?: number;
  notes?: string;
  // Populated relations (from API response)
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  location?: CompanyLocation;
}

// Time Entry interface (clock-in/clock-out records)
export interface TimeEntry extends BaseEntity {
  userId: string;
  locationId: string;
  status: TimeEntryStatus;
  clockInAt: Date;
  clockInLat: number;
  clockInLng: number;
  clockInAccuracy?: number;
  clockOutAt?: Date;
  clockOutLat?: number;
  clockOutLng?: number;
  clockOutAccuracy?: number;
  clockInWithinGeofence: boolean;
  clockOutWithinGeofence?: boolean;
  totalMinutes?: number;
  breakMinutes?: number;
  notes?: string;
  organizationId: string;
  // Approval workflow
  approvalStatus?: ApprovalStatus;
  approvedById?: string;
  approvedAt?: Date;
  approvalNotes?: string;
  // Edit tracking
  isEdited?: boolean;
  editedById?: string;
  editedAt?: Date;
  originalClockIn?: Date;
  originalClockOut?: Date;
  editReason?: string;
  // Populated relations
  location?: CompanyLocation;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  approvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  editedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  breaks?: Break[];
}

// Attendance Status (for technician's current clock status)
export interface AttendanceStatus {
  isClockedIn: boolean;
  currentEntry?: TimeEntry;
  assignedLocations: CompanyLocation[];
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
  assetId?: string;
  dueDate?: Date;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
  // Populated relation
  asset?: Asset;
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

// Asset Category interface (organization-defined)
export interface AssetCategory extends BaseEntity {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  organizationId: string;
}

// Asset Type interface (within a category)
export interface AssetType extends BaseEntity {
  name: string;
  description?: string;
  categoryId: string;
}

// Asset interface (the actual equipment)
export interface Asset extends BaseEntity {
  name: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  status: AssetStatus;
  installDate?: Date;
  warrantyExpiry?: Date;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string;
  organizationId: string;
  categoryId?: string;
  typeId?: string;
  // Populated relations
  category?: AssetCategory;
  type?: AssetType;
}

// Asset with maintenance history (using ServiceReports)
export interface AssetWithHistory extends Asset {
  serviceReports: ServiceReportSummary[];
}

// Service Report Summary (for asset maintenance history list)
export interface ServiceReportSummary {
  id: string;
  taskId: string;
  taskTitle: string;
  summary: string;
  workDuration: number; // in seconds
  completedAt: Date;
  completedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  partsTotal?: number; // Total cost of parts used
  attachmentCount: number;
  hasBeforePhotos: boolean;
  hasAfterPhotos: boolean;
}

// Service Report interface (full report)
export interface ServiceReport extends BaseEntity {
  taskId: string;
  assetId?: string;
  summary: string;
  workPerformed?: string;
  workDuration: number; // in seconds
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  completedAt: Date;
  completedById: string;
  organizationId: string;
  // Populated relations
  completedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  attachments?: ReportAttachment[];
  partsUsed?: PartUsed[];
}

// Report Attachment interface
export interface ReportAttachment extends BaseEntity {
  reportId: string;
  type: ReportAttachmentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  caption?: string;
}

// Part Used interface
export interface PartUsed extends BaseEntity {
  reportId: string;
  name: string;
  partNumber?: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
}

// Complete Task DTO (for creating report when completing task)
export interface CompleteTaskInput {
  summary: string;
  workPerformed?: string;
  workDuration: number;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  partsUsed?: {
    name: string;
    partNumber?: string;
    quantity: number;
    unitCost?: number;
    notes?: string;
  }[];
}

// Export attendance types
export * from './attendance';

// Export technician types
export * from './technician';
