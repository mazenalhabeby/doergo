/**
 * Employee Management Types
 *
 * Types for the full employee management system including
 * profiles, statistics, performance metrics, and API inputs.
 */

import { Role, TaskStatus } from './enums';

// ============================================================================
// EMPLOYEE PROFILE
// ============================================================================

/**
 * Full employee profile with computed fields
 * Used for detail views and list items
 */
export interface EmployeeProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Technician-specific fields
  specialty: string | null;
  position?: string | null;
  enabledModules?: string[] | null;
  /** 'IN_HOUSE' (employed → €9 field seat) | 'EXTERNAL' (freelancer → €15). */
  employmentType?: string | null;
  /** Labor cost model: 'HOURLY' | 'FIXED' | null. */
  costType?: string | null;
  /** €/hour (HOURLY) or €/month (FIXED), in cents. */
  costRateCents?: number | null;
  rating: number;
  ratingCount: number;
  maxDailyJobs: number;

  // Permissions
  canCreateTasks: boolean;

  // Profile badge overrides (null = use org defaults)
  profileBadges?: {
    showRole: boolean;
    showType: boolean;
    showSpecialty: boolean;
  } | null;

  // Organization
  organizationId: string;
  organization?: {
    id: string;
    name: string;
  };

  // Computed fields (populated by backend)
  currentTaskCount?: number; // Active tasks right now
  todayTaskCount?: number; // Tasks assigned today
  completedTaskCount?: number; // Total completed tasks
  lastLocationUpdatedAt?: string | null;
  lastLocation?: {
    lat: number;
    lng: number;
    accuracy?: number;
    updatedAt: string;
  } | null;

  // Online status (computed from lastLocationUpdatedAt)
  isOnline?: boolean;
}

/**
 * Simplified employee data for list views
 */
export interface EmployeeListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  specialty: string | null;
  position?: string | null;
  enabledModules?: string[] | null;
  rating: number;
  ratingCount: number;
  maxDailyJobs: number;
  canCreateTasks: boolean;
  currentTaskCount: number;
  todayTaskCount: number;
  isOnline: boolean;
  lastLocationUpdatedAt: string | null;
}

// ============================================================================
// EMPLOYEE STATISTICS
// ============================================================================

/**
 * Comprehensive employee statistics
 * Used for the detail page Overview tab
 */
export interface EmployeeStats {
  // Task statistics
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    assigned: number;
    completedOnTime: number;
    avgCompletionTimeMinutes: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<string, number>;
  };

  // Attendance statistics
  attendance: {
    totalHoursThisWeek: number;
    totalHoursThisMonth: number;
    shiftsThisWeek: number;
    shiftsThisMonth: number;
    averageShiftHours: number;
    geofenceViolations: number;
    lateClockIns: number;
  };

  // Performance metrics
  performance: {
    completionRate: number; // percentage
    onTimeRate: number; // percentage
    customerRating: number; // 1-5
    ratingCount: number;
    responseTimeMinutes: number; // avg time to accept task
  };

  // Recent activity
  recentActivity: EmployeeActivityItem[];
}

/**
 * Activity item for recent activity feed
 */
export interface EmployeeActivityItem {
  id: string;
  type:
    | 'TASK_COMPLETED'
    | 'TASK_ASSIGNED'
    | 'TASK_STARTED'
    | 'CLOCK_IN'
    | 'CLOCK_OUT'
    | 'BREAK_TAKEN';
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

/**
 * Time-series performance data for charts
 */
export interface PerformanceMetrics {
  period: {
    startDate: string;
    endDate: string;
  };

  // Summary metrics
  summary: {
    completionRate: number;
    onTimeRate: number;
    avgTaskDuration: number; // minutes
    tasksCompleted: number;
    customerRating: number;
    totalHoursWorked: number;
  };

  // Daily trends for charting
  trends: PerformanceTrendPoint[];

  // Comparison with previous period
  comparison?: {
    completionRateChange: number; // percentage points
    onTimeRateChange: number;
    ratingChange: number;
    tasksCompletedChange: number; // percentage change
  };
}

/**
 * Single data point for performance trends
 */
export interface PerformanceTrendPoint {
  date: string;
  completedTasks: number;
  avgDurationMinutes: number;
  rating: number | null; // null if no ratings that day
  hoursWorked: number;
  onTimeRate: number;
}

// ============================================================================
// API INPUTS
// ============================================================================

/**
 * Input for creating a new employee
 */
export interface CreateEmployeeInput {
  email: string;
  firstName: string;
  lastName: string;
  password?: string; // Optional - system can generate
  position?: string;
  enabledModules?: string[];
  specialty?: string;
  maxDailyJobs?: number;
}

/**
 * Input for updating an employee
 */
export interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  position?: string;
  enabledModules?: string[];
  specialty?: string;
  /** 'IN_HOUSE' (€9 field seat) | 'EXTERNAL' (€15). */
  employmentType?: string;
  /** Labor cost model: 'HOURLY' | 'FIXED' | null (not costed). */
  costType?: string | null;
  /** €/hour (HOURLY) or €/month (FIXED), in cents. */
  costRateCents?: number | null;
  maxDailyJobs?: number;
  isActive?: boolean;
  rating?: number;
  ratingCount?: number;
  canCreateTasks?: boolean;
  profileBadges?: {
    showRole: boolean;
    showType: boolean;
    showSpecialty: boolean;
  } | null;
}

/**
 * Query parameters for listing employees
 */
export interface EmployeesQueryParams {
  // Filters
  status?: 'active' | 'inactive' | 'all';
  position?: string;
  specialty?: string;
  search?: string; // Search by name or email

  // Pagination
  page?: number;
  limit?: number;

  // Sorting
  sortBy?: 'name' | 'email' | 'rating' | 'taskCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// API RESPONSES
// ============================================================================

/**
 * Response for listing employees
 */
export interface EmployeesListResponse {
  success: boolean;
  data: EmployeeListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Response for getting a single employee
 */
export interface EmployeeDetailResponse {
  success: boolean;
  data: EmployeeProfile & {
    stats: EmployeeStats;
  };
}

/**
 * Response for employee performance metrics
 */
export interface EmployeePerformanceResponse {
  success: boolean;
  data: PerformanceMetrics;
}

// ============================================================================
// AVAILABILITY & SCHEDULE
// ============================================================================

/**
 * Employee availability for a specific day
 */
export interface EmployeeAvailability {
  technicianId: string;
  technician: {
    id: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
  };
  date: string;
  isAvailable: boolean;
  assignedLocationId: string | null;
  assignedLocation: {
    id: string;
    name: string;
  } | null;
  scheduledTasks: number;
  maxDailyJobs: number;
  hasTimeEntry: boolean; // Has clocked in that day
}

/**
 * Calendar view data for availability management
 */
export interface AvailabilityCalendarData {
  startDate: string;
  endDate: string;
  technicians: {
    id: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
  }[];
  availability: EmployeeAvailability[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an employee is considered "online"
 * Online = location updated within the last 5 minutes
 */
export function isEmployeeOnline(
  lastLocationUpdatedAt: string | null | undefined
): boolean {
  if (!lastLocationUpdatedAt) return false;
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return new Date(lastLocationUpdatedAt).getTime() > fiveMinutesAgo;
}

/**
 * Get availability status label
 */
export function getAvailabilityStatus(
  currentTasks: number,
  maxDailyJobs: number
): 'available' | 'busy' | 'at_capacity' {
  if (currentTasks >= maxDailyJobs) return 'at_capacity';
  if (currentTasks > 0) return 'busy';
  return 'available';
}

/**
 * Get availability status label for display
 */
export function getAvailabilityLabel(
  status: 'available' | 'busy' | 'at_capacity'
): string {
  switch (status) {
    case 'available':
      return 'Available';
    case 'busy':
      return 'Busy';
    case 'at_capacity':
      return 'At Capacity';
  }
}

/**
 * Get availability status color class
 */
export function getAvailabilityColor(
  status: 'available' | 'busy' | 'at_capacity'
): string {
  switch (status) {
    case 'available':
      return 'bg-green-100 text-green-700';
    case 'busy':
      return 'bg-amber-100 text-amber-700';
    case 'at_capacity':
      return 'bg-red-100 text-red-700';
  }
}

/**
 * Format rating for display (e.g., "4.5" or "N/A")
 */
export function formatRating(
  rating: number | null | undefined,
  ratingCount: number | null | undefined
): string {
  if (!rating || !ratingCount || ratingCount === 0) return 'N/A';
  return rating.toFixed(1);
}

/**
 * Common job title suggestions for autocomplete
 * Admins/dispatchers can type any custom title
 */
export const SPECIALTY_OPTIONS = [
  { value: 'Electrician', label: 'Electrician' },
  { value: 'Plumber', label: 'Plumber' },
  { value: 'HVAC Technician', label: 'HVAC Technician' },
  { value: 'Mechanic', label: 'Mechanic' },
  { value: 'Fire Inspector', label: 'Fire Inspector' },
  { value: 'IT Technician', label: 'IT Technician' },
  { value: 'General Maintenance', label: 'General Maintenance' },
] as const;

// ============================================================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================================================
// These aliases keep other packages (mobile, api) working until they are migrated.

/** @deprecated Use EmployeeProfile */
export type TechnicianProfile = EmployeeProfile;
/** @deprecated Use EmployeeListItem */
export type TechnicianListItem = EmployeeListItem;
/** @deprecated Use EmployeeStats */
export type TechnicianStats = EmployeeStats;
/** @deprecated Use EmployeeActivityItem */
export type TechnicianActivityItem = EmployeeActivityItem;
/** @deprecated Use CreateEmployeeInput */
export type CreateTechnicianInput = CreateEmployeeInput;
/** @deprecated Use UpdateEmployeeInput */
export type UpdateTechnicianInput = UpdateEmployeeInput;
/** @deprecated Use EmployeesQueryParams */
export type TechniciansQueryParams = EmployeesQueryParams;
/** @deprecated Use EmployeesListResponse */
export type TechniciansListResponse = EmployeesListResponse;
/** @deprecated Use EmployeeDetailResponse */
export type TechnicianDetailResponse = EmployeeDetailResponse;
/** @deprecated Use EmployeePerformanceResponse */
export type TechnicianPerformanceResponse = EmployeePerformanceResponse;
/** @deprecated Use EmployeeAvailability */
export type TechnicianAvailability = EmployeeAvailability;
/** @deprecated Use isEmployeeOnline */
export const isTechnicianOnline = isEmployeeOnline;
