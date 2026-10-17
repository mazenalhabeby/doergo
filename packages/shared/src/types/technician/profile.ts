/** A member as the office reads them: profile, list row, stats, activity, performance. */
import { Role, TaskStatus } from '../enums';

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
  /**
   * Works for a client or partner. Their worker statistics — tasks done, hours
   * this week, an on-time score — are structurally zero: they supervise, they
   * do not execute, and they never clock in here.
   */
  isExternal?: boolean;
  isActive: boolean;
  /** Date of birth (YYYY-MM-DD), when the record holds one. */
  dateOfBirth?: string | null;
  createdAt: string;
  updatedAt: string;

  // Technician-specific fields
  specialty: string | null;
  position?: string | null;
  /**
   * Their access role, e.g. "Operations Manager".
   *
   * The server has always selected it; the type never declared it, so every
   * screen that wanted to say who somebody IS had only a name to work with.
   */
  memberRole?: { id: string; name: string; color?: string | null } | null;
  enabledModules?: string[] | null;
  /** 'IN_HOUSE' (employed → €9 field seat) | 'EXTERNAL' (freelancer → €15). */
  employmentType?: string | null;
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
