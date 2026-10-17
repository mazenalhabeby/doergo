/** Creating, editing and listing members; their availability. */
import type { EmployeeListItem, EmployeeProfile, EmployeeStats, PerformanceMetrics } from './profile';

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
  /**
   * Hourly rates, in integer cents.
   *
   * ⚠️ `undefined` and `null` are different on the wire. Undefined is "not
   * mentioned in this request" and leaves the column alone; null is "clear it,
   * inherit from the level above". A form that sends 0 for an empty field has
   * told the server this person bills nothing — which is a rate, not a blank.
   */
  billRateCents?: number | null;
  costRateCents?: number | null;
  /** What a DAY of this person costs you, in cents (paid per day worked). */
  costDayCents?: number | null;
  /** First day a changed rate applies, `YYYY-MM-DD`; default today. */
  rateEffectiveFrom?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  enabledModules?: string[];
  specialty?: string;
  /** 'IN_HOUSE' (€9 field seat) | 'EXTERNAL' (€15). */
  employmentType?: string;
  maxDailyJobs?: number;
  /** Annual vacation days. Null = use the organization's default; 0 = none. */
  leaveAllowance?: number | null;
  /** When they actually started (YYYY-MM-DD) — pro-rates their first year. */
  employmentStartDate?: string | null;
  /**
   * Date of birth (YYYY-MM-DD). No time, no timezone.
   *
   * Also what lets `checkScan` compare a scanned passport against the member
   * rather than only asking whether the date is plausible for a working person.
   */
  dateOfBirth?: string | null;
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
