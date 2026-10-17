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
  AvailabilityCalendarData,
} from './technician/inputs';
export {
  isEmployeeOnline,
  formatRating,
  SPECIALTY_OPTIONS,
  type TechnicianProfile,
  type TechnicianListItem,
  type TechnicianStats,
  type TechnicianActivityItem,
  type CreateTechnicianInput,
  type UpdateTechnicianInput,
  type TechniciansQueryParams,
  type TechniciansListResponse,
  type TechnicianDetailResponse,
  type TechnicianPerformanceResponse,
  type TechnicianAvailability,
  isTechnicianOnline,
} from './technician/helpers';
