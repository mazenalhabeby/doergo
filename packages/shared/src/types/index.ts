// Re-export all enums from dedicated file (avoids require cycles with sub-modules)
export {
  Role, Platform, AccessLevel, TaskStatus, TaskPriority, TaskEventType,
  AttachmentType, AssetStatus, ReportAttachmentType, TechnicianType,
  ContractType, OvertimePolicy, OvertimeDetectionSource,
  TimeEntryStatus, BreakType, ApprovalStatus,
} from './enums';

import {
  Role, Platform, AccessLevel, TaskStatus, TaskPriority,
  TechnicianType,
  AttachmentType, AssetStatus, ReportAttachmentType, TaskEventType,
} from './enums';

// Legacy role aliases for backward compatibility during migration
export const LegacyRoleMap = {
  PARTNER: Role.ADMIN,
  OFFICE: Role.DISPATCHER,
  WORKER: Role.EMPLOYEE,
  CLIENT: Role.ADMIN,
  TECHNICIAN: Role.EMPLOYEE,
} as const;

/** WORKER is a legacy alias for EMPLOYEE (stored as TECHNICIAN in DB) */
export const WORKER_ROLE = 'WORKER' as const;

// Helper to normalize role (handles backward compatibility)
export function normalizeRole(role: string): Role {
  if (role === 'CLIENT') return Role.ADMIN;
  if (role === 'WORKER') return Role.EMPLOYEE;
  if (role === 'TECHNICIAN') return Role.EMPLOYEE;
  return role as Role;
}

// Get display label for a role, optionally using position name
export function getRoleLabel(role: string, position?: string | null): string {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case Role.ADMIN:
      return 'Administrator';
    case Role.DISPATCHER:
      return 'Dispatcher';
    case Role.EMPLOYEE:
    case Role.TECHNICIAN:
      // If user has a position, use it as label (capitalized)
      if (position) {
        return position.charAt(0).toUpperCase() + position.slice(1).replace(/_/g, ' ');
      }
      return 'Employee';
    default:
      return role;
  }
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
  organizationId: string | null;
  isActive: boolean;
  onboardingCompleted: boolean;
  // Permission fields
  platform: Platform;
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Technician-specific fields
  technicianType?: TechnicianType;
  position?: string | null;
  enabledModules?: string[] | null;
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
    // Deprecated: Use EMPLOYEE instead
    platform: Platform.MOBILE,
    canCreateTasks: false,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  },
  [Role.EMPLOYEE]: {
    platform: Platform.MOBILE,
    canCreateTasks: false,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  },
};

// Profile badge visibility configuration
export interface ProfileBadgesConfig {
  showRole: boolean;
  showType: boolean;
  showSpecialty: boolean;
}

export const DEFAULT_PROFILE_BADGES: ProfileBadgesConfig = {
  showRole: true,
  showType: true,
  showSpecialty: true,
};

// Organization interface
export interface Organization extends BaseEntity {
  name: string;
  isActive: boolean;
}

// CompanyLocation, Break, TimeEntry, AttendanceStatus
// are defined in ./attendance.ts and re-exported below via `export * from './attendance'`

// Technician Assignment interface (many-to-many: User ↔ CompanyLocation)
export interface TechnicianAssignment extends BaseEntity {
  userId: string;
  locationId: string;
  isPrimary: boolean;
  schedule: string[];
  effectiveFrom: Date;
  effectiveTo?: Date;
  location?: {
    id: string;
    name: string;
    address?: string;
    lat: number;
    lng: number;
    geofenceRadius: number;
  };
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    technicianType?: TechnicianType;
  };
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

// Export invitation types
export * from './invitation';

// Export onboarding types
export * from './onboarding';

// Export modules types
export * from './modules';

// Export contract types
export * from './contract';
