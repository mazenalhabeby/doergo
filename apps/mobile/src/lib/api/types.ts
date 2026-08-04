import {
  

  TimeEntryStatus,
  BreakType,
  Role,
  Platform,
  TaskStatus,
  TaskPriority,
} from '@hbcfield/shared/client';
import type {
  CompanyLocation,
  TimeEntry,
  AttendanceStatus,
  Break,
  BreakStatus,
  ClockInInput,
  ClockOutInput,
  AttendanceHistoryParams,
  PaginatedResponse,
  InvitationValidation,
  AcceptInvitationInput,
  TechnicianListItem,
  TechniciansListResponse,
} from '@hbcfield/shared/client';

// Re-export shared enums
export { TimeEntryStatus, BreakType, Role, Platform, TaskStatus, TaskPriority };

// Re-export shared types
export type {
  CompanyLocation,
  TimeEntry,
  AttendanceStatus,
  Break,
  BreakStatus,
  ClockInInput,
  ClockOutInput,
  AttendanceHistoryParams,
  PaginatedResponse,
  InvitationValidation,
  AcceptInvitationInput,
  TechnicianListItem,
  TechniciansListResponse,
};

// ============================================================================
// Auth Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'CLIENT' | 'DISPATCHER' | 'TECHNICIAN' | 'EMPLOYEE' | 'CUSTOMER';
  organizationId: string | null;
  onboardingCompleted: boolean;
  // Customer portal: bound Customer + default unit (only for role=CUSTOMER).
  customerId?: string | null;
  unitId?: string | null;
  customerPortalEnabled?: boolean;
  avatarUrl?: string | null;
  // Permission fields
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Billing tier the org is on — gates premium features (custom fields, etc.).
  // Server-authoritative; sent in the login/validateToken payload.
  planTier?: 'starter' | 'professional' | 'business' | 'enterprise' | null;
  // Technician-specific fields
  position?: string | null;
  technicianType?: string | null;
  // Manual availability override (null = auto from task).
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null;
  // Per-user clock display preference ("12h" | "24h"); display-only.
  timeFormat?: '12h' | '24h' | null;
  // IANA timezone of the org (e.g. "Europe/Vienna"). Default display zone for
  // times so they render in a fixed, labeled zone instead of the device's local
  // zone. Attendance call sites override per-entry with the location's timezone.
  organizationTimezone?: string | null;
  // Either a legacy string[] (org-level default) or a per-user AccessProfile
  // object ({ modules, platforms, spaceScope, canContact }). Read via the
  // shared getModules/hasModule/getAccessPlatforms helpers — never indexed directly.
  enabledModules?: string[] | Record<string, unknown> | null;
  specialty?: string | null;
  // Profile badge visibility (resolved: user override > org default > system default)
  profileBadges?: {
    showRole: boolean;

    showType: boolean;
    showSpecialty: boolean;
  };
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// ============================================================================
// Task Types
// ============================================================================

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  assignedToId?: string;
  spaceId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationAddress?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  organizationId: string;
  createdById: string;
  assignedToId?: string;
  createdAt: string;
  updatedAt: string;
  // DB-derived task-time anchors (timer counts from acceptedAt; freezes at completedAt)
  acceptedAt?: string | null;
  completedAt?: string | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
  };
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface TaskEvent {
  id: string;
  eventType: string;
  metadata?: Record<string, any>;
  createdAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

// ============================================================================
// Tracking Types
// ============================================================================

export interface LocationUpdate {
  lat: number;
  lng: number;
  accuracy?: number;
  taskId?: string;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: string;
}

export interface LocationBatchUpdate {
  taskId?: string;
  points: LocationPoint[];
}

export interface LocationResponse {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: string;
}

// ============================================================================
// Report Types
// ============================================================================

export interface PartUsedInput {
  name: string;
  partNumber?: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
}

export interface CompleteTaskInput {
  summary: string;
  workPerformed?: string;
  workDuration: number; // in seconds
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  partsUsed?: PartUsedInput[];
}

export interface ServiceReport {
  id: string;
  taskId: string;
  summary: string;
  workPerformed?: string;
  workDuration: number;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  completedAt: string;
  completedById: string;
}

// ============================================================================
// Push Types
// ============================================================================

export interface RegisterPushTokenInput {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
}

// ============================================================================
// Time-Off Types
// ============================================================================

export interface TimeOffRequest {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  approvedById?: string;
  approvedBy?: { id: string; firstName: string; lastName: string };
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Availability & Schedule Types
// ============================================================================

export interface TechnicianAvailability {
  id: string;
  firstName: string;
  lastName: string;
  isAvailable: boolean;
  onTimeOff: boolean;
  schedule: { startTime: string; endTime: string } | null;
  timeOff: { id: string; reason?: string } | null;
}

export interface AvailabilityResponse {
  date: string;
  dayOfWeek: number;
  dayName: string;
  technicians: TechnicianAvailability[];
  summary: { total: number; available: number; onTimeOff: number; notScheduled: number };
}

export interface ScheduleEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notes?: string;
}
