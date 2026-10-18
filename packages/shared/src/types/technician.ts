/**
 * Employee Management Types
 *
 * Types for the full employee management system including
 * profiles, statistics, performance metrics, and API inputs.
 */
export type {
  EmployeeProfile,
  EmployeeListItem,
  EmployeeStats,
  EmployeeActivityItem,
  PerformanceMetrics,
  PerformanceTrendPoint,
} from './technician/profile';
export type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  EmployeesQueryParams,
  EmployeesListResponse,
  EmployeeDetailResponse,
  EmployeePerformanceResponse,
  EmployeeAvailability,
} from './technician/inputs';
export {
  isEmployeeOnline,
  SPECIALTY_OPTIONS,
  type TechnicianListItem,
  type TechniciansListResponse,
  type TechnicianAvailability,
} from './technician/helpers';
