import {
  TechnicianType,
  WorkMode,
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
export { TechnicianType, WorkMode, TimeEntryStatus, BreakType, Role, Platform, TaskStatus, TaskPriority };

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
  role: 'ADMIN' | 'CLIENT' | 'DISPATCHER' | 'TECHNICIAN';
  organizationId: string | null;
  onboardingCompleted: boolean;
  avatarUrl?: string | null;
  // Permission fields
  platform: 'WEB' | 'MOBILE' | 'BOTH';
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Technician-specific fields
  technicianType?: TechnicianType;
  workMode?: WorkMode;
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
  assignedToId?: string;
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
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
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
