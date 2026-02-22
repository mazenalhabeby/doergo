/**
 * Technician Management Types
 *
 * Types for the full technicians management system including
 * profiles, statistics, performance metrics, and API inputs.
 */

import { TechnicianType, WorkMode, Role, Platform, TaskStatus } from './index';

// ============================================================================
// TECHNICIAN PROFILE
// ============================================================================

/**
 * Full technician profile with computed fields
 * Used for detail views and list items
 */
export interface TechnicianProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Technician-specific fields
  technicianType: TechnicianType;
  workMode: WorkMode;
  specialty: string | null;
  rating: number;
  ratingCount: number;
  maxDailyJobs: number;

  // Organization
  organizationId: string;
  organization?: {
    id: string;
    name: string;
  };

  // Platform access
  platform: Platform;

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
 * Simplified technician data for list views
 */
export interface TechnicianListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  technicianType: TechnicianType;
  workMode: WorkMode;
  specialty: string | null;
  rating: number;
  ratingCount: number;
  maxDailyJobs: number;
  currentTaskCount: number;
  todayTaskCount: number;
  isOnline: boolean;
  lastLocationUpdatedAt: string | null;
}

// ============================================================================
// TECHNICIAN STATISTICS
// ============================================================================

/**
 * Comprehensive technician statistics
 * Used for the detail page Overview tab
 */
export interface TechnicianStats {
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
  recentActivity: TechnicianActivityItem[];
}

/**
 * Activity item for recent activity feed
 */
export interface TechnicianActivityItem {
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
 * Input for creating a new technician
 */
export interface CreateTechnicianInput {
  email: string;
  firstName: string;
  lastName: string;
  password?: string; // Optional - system can generate
  technicianType?: TechnicianType;
  workMode?: WorkMode;
  specialty?: string;
  maxDailyJobs?: number;
}

/**
 * Input for updating a technician
 */
export interface UpdateTechnicianInput {
  firstName?: string;
  lastName?: string;
  technicianType?: TechnicianType;
  workMode?: WorkMode;
  specialty?: string;
  maxDailyJobs?: number;
  isActive?: boolean;
  rating?: number;
  ratingCount?: number;
}

/**
 * Query parameters for listing technicians
 */
export interface TechniciansQueryParams {
  // Filters
  status?: 'active' | 'inactive' | 'all';
  type?: TechnicianType | 'all';
  workMode?: WorkMode | 'all';
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
 * Response for listing technicians
 */
export interface TechniciansListResponse {
  success: boolean;
  data: TechnicianListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Response for getting a single technician
 */
export interface TechnicianDetailResponse {
  success: boolean;
  data: TechnicianProfile & {
    stats: TechnicianStats;
  };
}

/**
 * Response for technician performance metrics
 */
export interface TechnicianPerformanceResponse {
  success: boolean;
  data: PerformanceMetrics;
}

// ============================================================================
// AVAILABILITY & SCHEDULE
// ============================================================================

/**
 * Technician availability for a specific day
 */
export interface TechnicianAvailability {
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
  availability: TechnicianAvailability[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get display label for technician type
 */
export function getTechnicianTypeLabel(type: TechnicianType): string {
  switch (type) {
    case TechnicianType.FREELANCER:
      return 'Freelancer';
    case TechnicianType.FULL_TIME:
      return 'Full-Time';
    default:
      return type;
  }
}

/**
 * Get color class for technician type badge
 */
export function getTechnicianTypeColor(type: TechnicianType): string {
  switch (type) {
    case TechnicianType.FREELANCER:
      return 'bg-purple-100 text-purple-700';
    case TechnicianType.FULL_TIME:
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

/**
 * Check if a technician is considered "online"
 * Online = location updated within the last 5 minutes
 */
export function isTechnicianOnline(
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
 * Get specialty options for dropdown/filter
 */
export const SPECIALTY_OPTIONS = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'general', label: 'General' },
  { value: 'other', label: 'Other' },
] as const;

// ============================================================================
// WORK MODE HELPERS
// ============================================================================

/**
 * Get display label for work mode
 */
export function getWorkModeLabel(mode: WorkMode): string {
  switch (mode) {
    case WorkMode.ON_SITE:
      return 'On-Site';
    case WorkMode.ON_ROAD:
      return 'On-Road';
    case WorkMode.HYBRID:
      return 'Hybrid';
    default:
      return mode;
  }
}

/**
 * Get color class for work mode badge
 */
export function getWorkModeColor(mode: WorkMode): string {
  switch (mode) {
    case WorkMode.ON_SITE:
      return 'bg-teal-100 text-teal-700';
    case WorkMode.ON_ROAD:
      return 'bg-orange-100 text-orange-700';
    case WorkMode.HYBRID:
      return 'bg-indigo-100 text-indigo-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

/**
 * Check if a technician's work mode allows attendance (clock in/out)
 * ON_SITE and HYBRID can use attendance, ON_ROAD cannot
 */
export function canUseAttendance(workMode: WorkMode): boolean {
  return workMode === WorkMode.ON_SITE || workMode === WorkMode.HYBRID;
}

/**
 * Check if a technician's work mode allows location assignment
 * ON_SITE and HYBRID can be assigned to locations, ON_ROAD cannot
 */
export function canBeAssignedToLocation(workMode: WorkMode): boolean {
  return workMode === WorkMode.ON_SITE || workMode === WorkMode.HYBRID;
}
