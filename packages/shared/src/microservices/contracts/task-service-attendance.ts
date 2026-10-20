/** task-service: time entries — where to clock in, status, history, entries, presence, approving and correcting. */
import { rpc } from '../contract';
import type { AttendanceScope } from '../../access/space-scope';
import type { ManualEntriesMessage } from './task-service-types';

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

export const resolveForgotClockOut = rpc<{
  userId: string;
  entryId: string;
  clockOutAt: string;
  organizationId: string;
}>('resolve_forgot_clock_out');

export const getEntryPresence = rpc<{ entryId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }>(
  'get_entry_presence',
);

export const getPendingApprovals = rpc<{
  scopeSpaceIds?: AttendanceScope;
  organizationId: string;
  page?: number;
  limit?: number;
  summary?: boolean;
}>('get_pending_approvals');

export const approveEntry = rpc<{
  scopeSpaceIds?: AttendanceScope;
  entryId: string;
  approverId: string;
  organizationId: string;
  notes?: string;
}>('approve_entry');

export const rejectEntry = rpc<{
  scopeSpaceIds?: AttendanceScope;
  entryId: string;
  approverId: string;
  organizationId: string;
  reason: string;
}>('reject_entry');

export const editEntry = rpc<{
  scopeSpaceIds?: AttendanceScope;
  entryId: string;
  editorId: string;
  organizationId: string;
  clockInAt?: string;
  clockOutAt?: string;
  notes?: string;
  timezone?: string;
  reason: string;
}>('edit_entry');

export const getEntryHistory = rpc<{ entryId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }>(
  'get_entry_history',
);

export const deleteEntry = rpc<{
  entryId: string;
  editorId: string;
  organizationId: string;
  scopeSpaceIds?: AttendanceScope;
  reason?: string;
}>('delete_entry');

export const addManualEntries = rpc<ManualEntriesMessage>('add_manual_entries');

export const bulkApproveEntries = rpc<{
  scopeSpaceIds?: AttendanceScope;
  entryIds: string[];
  approverId: string;
  organizationId: string;
  notes?: string;
}>('bulk_approve_entries');
