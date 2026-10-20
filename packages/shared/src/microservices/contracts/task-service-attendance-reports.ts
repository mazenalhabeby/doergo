/** task-service: attendance reports — summary, week, month, CSV. */
import { rpc } from '../contract';
import type { AttendanceScope } from '../../access/space-scope';

export const getAttendanceSummary = rpc<{
  scopeSpaceIds?: AttendanceScope;
  organizationId: string;
  userId?: string;
  startDate: Date | string;
  endDate: Date | string;
}>('get_attendance_summary');

export const getWeeklyReport = rpc<{
  scopeSpaceIds?: AttendanceScope;
  organizationId: string;
  userId?: string;
  weekStartDate?: Date | string;
}>('get_weekly_report');

export const getMonthlyReport = rpc<{
  scopeSpaceIds?: AttendanceScope;
  organizationId: string;
  userId?: string;
  year?: number;
  month?: number;
}>('get_monthly_report');

export const exportAttendanceCsv = rpc<{
  scopeSpaceIds?: AttendanceScope;
  organizationId: string;
  startDate: Date | string;
  endDate: Date | string;
  userId?: string;
}>('export_attendance_csv');
