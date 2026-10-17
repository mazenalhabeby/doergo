/** task-service attendance-1 handlers — contracts (request types are what the handler reads). */
import { rpc } from '../contract';
import type { ExtraTimeDecisionMessage, BreakRuleInput } from './task-service-1-types';
import type { AttendanceScope } from '../../index';
import type { SpaceScopeIds } from '../../access/space-scope';
import type { OccurrenceEvidence } from '../../sync/occurrence';

export const listClockInLocations = rpc<{ userId: string; organizationId: string }>('list_clock_in_locations');
export const getAttendanceStatus = rpc<{ userId: string; organizationId: string }>('get_attendance_status');
export const getAttendanceHistory = rpc<{
  userId: string;
  organizationId: string;
  scopeSpaceIds?: AttendanceScope;
  startDate?: Date | string;
  endDate?: Date | string;
  page?: number;
  limit?: number;
}>('get_attendance_history');
export const getLocationEntries = rpc<{
  locationId: string;
  organizationId: string;
  date?: Date | string;
  startDate?: Date | string;
  endDate?: Date | string;
  search?: string;
  page?: number;
  limit?: number;
  requesterId?: string;
  viewScopeSpaceIds: AttendanceScope;
  sortBy?: string;
  sortOrder?: string;
  sharedSpaceIds?: string[];
}>('get_location_entries');
export const getLocationEntriesBatch = rpc<{
  locationIds: string[];
  organizationId: string;
  date?: Date | string;
  requesterId?: string;
  viewScopeSpaceIds: AttendanceScope;
}>('get_location_entries_batch');
export const getAllEntries = rpc<{
  organizationId: string;
  scopeSpaceIds?: AttendanceScope;
  date?: Date | string;
  startDate?: Date | string;
  endDate?: Date | string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}>('get_all_entries');
export const getActiveEntries = rpc<{ organizationId: string; scopeSpaceIds?: AttendanceScope }>('get_active_entries');
export const listNoShows = rpc<{
  organizationId: string;
  days?: number;
  spaceId?: string;
  scopeSpaceIds?: AttendanceScope;
  open?: boolean;
}>('list_no_shows');
export const resolveNoShow = rpc<{
  id: string;
  organizationId: string;
  action: 'excuse' | 'absent' | 'reopen';
  reasonCode?: string;
  reason?: string;
  wholeRun?: boolean;
  excusedById?: string;
  scopeSpaceIds?: AttendanceScope;
}>('resolve_no_show');
export const noShowSummary = rpc<{
  organizationId: string;
  days?: number;
  spaceId?: string;
  scopeSpaceIds?: AttendanceScope;
}>('no_show_summary');
export const reportGeofenceExcursion = rpc<{
  userId: string;
  organizationId: string;
  scopeSpaceIds?: AttendanceScope;
  reason: string;
  requestedMinutes: number;
}>('report_geofence_excursion');
export const approveGeofenceExcursion = rpc<{
  scopeSpaceIds?: AttendanceScope;
  excursionId: string;
  approverId: string;
  organizationId: string;
  grantedMinutes?: number;
}>('approve_geofence_excursion');
export const rejectGeofenceExcursion = rpc<{
  scopeSpaceIds?: AttendanceScope;
  excursionId: string;
  approverId: string;
  organizationId: string;
}>('reject_geofence_excursion');
export const listGeofenceExcursions = rpc<{
  organizationId: string;
  status?: 'active' | 'pending' | 'approved';
  scopeSpaceIds?: AttendanceScope;
}>('list_geofence_excursions');
export const resolveForgotClockOut = rpc<{
  userId: string;
  entryId: string;
  clockOutAt: string;
  organizationId: string;
}>('resolve_forgot_clock_out');
export const requestExtraTime = rpc<{
  userId: string;
  entryId: string;
  organizationId: string;
  occurredAt?: string | null;
}>('request_extra_time');
export const approveExtraTime = rpc<ExtraTimeDecisionMessage>('approve_extra_time');
export const addOvertimeToEntry = rpc<{
  approverId: string;
  entryId: string;
  minutes: number;
  reason?: string | null;
  organizationId: string;
  scopeSpaceIds?: AttendanceScope;
}>('add_overtime_to_entry');
export const removeApprovedOvertime = rpc<{
  actorId: string;
  overtimeId: string;
  organizationId: string;
  scopeSpaceIds?: AttendanceScope;
}>('remove_approved_overtime');
export const rejectExtraTime = rpc<{
  approverId: string;
  entryId: string;
  organizationId: string;
  reason?: string | null;
}>('reject_extra_time');
export const listPendingExtraTime = rpc<{ userId: string; organizationId: string; isAdmin?: boolean }>(
  'list_pending_extra_time',
);
export const getEntryPresence = rpc<{ entryId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }>(
  'get_entry_presence',
);
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
export const startBreak = rpc<{
  userId: string;
  organizationId: string;
  type?: string;
  notes?: string;
  ruleId?: string;
  id?: string;
  entryId?: string;
  evidence?: OccurrenceEvidence;
}>('start_break');
export const snoozeBreak = rpc<{ userId: string; organizationId: string; ruleId?: string }>('snooze_break');
export const listBreakRules = rpc<{ organizationId: string; spaceId?: string; shiftId?: string }>('list_break_rules');
export const createBreakRule = rpc<BreakRuleInput & { organizationId: string; scopeSpaceIds?: SpaceScopeIds }>(
  'create_break_rule',
);
