/** Small helpers, the specialty list, and the old Technician* names. */
import type {
  CreateEmployeeInput,
  EmployeeAvailability,
  EmployeeDetailResponse,
  EmployeePerformanceResponse,
  EmployeesListResponse,
  EmployeesQueryParams,
  UpdateEmployeeInput,
} from './inputs';
import type { EmployeeActivityItem, EmployeeListItem, EmployeeProfile, EmployeeStats } from './profile';

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
