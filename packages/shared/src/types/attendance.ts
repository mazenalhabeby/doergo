/**
 * Shared Attendance Types
 * These types are used by both web and mobile apps to ensure consistency.
 * Import from '@hbcfield/shared' instead of redefining in each app.
 */
export type { CompanyLocation } from './attendance/location';
export type {
  TimeEntry,
  AttendanceStatus,
  UnconfirmedClockOut,
  GeofenceExcursionStatus,
  GeofenceExcursion,
  ReportExcursionInput,
  ApproveExcursionInput,
} from './attendance/entry';
export type {
  Break,
  BreakStatus,
  BreakSummary,
  ClockInInput,
  ClockOutInput,
  ClockOutHandoverInput,
  StartBreakInput,
  EndBreakInput,
  AttendanceHistoryParams,
  AttendanceQueryParams,
  BreakHistoryParams,
  BreakSummaryParams,
  AttendanceSummary,
  CSVExportResult,
  PaginatedResponse,
} from './attendance/breaks-inputs';
export { isBreakActive, mayClockInRemotely, workedMinutes } from './attendance/helpers';
