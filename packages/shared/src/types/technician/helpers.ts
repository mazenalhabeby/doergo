/** Small helpers, the specialty list, and the old Technician* names. */
import type { EmployeeAvailability, EmployeesListResponse } from './inputs';
import type { EmployeeListItem } from './profile';

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

/** @deprecated Use EmployeeListItem */
export type TechnicianListItem = EmployeeListItem;

/** @deprecated Use EmployeesListResponse */
export type TechniciansListResponse = EmployeesListResponse;

/** @deprecated Use EmployeeAvailability */
export type TechnicianAvailability = EmployeeAvailability;
