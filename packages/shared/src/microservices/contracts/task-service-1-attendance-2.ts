/** task-service attendance-2 handlers — contracts (request types are what the handler reads). */
import { rpc } from '../contract';
import type { ManualEntriesMessage, BreakRuleInput } from './task-service-1-types';
import type { BreakType } from '@prisma/client';
import type { AttendanceScope } from '../../index';
import type { SpaceScopeIds } from '../../access/space-scope';
import type { OccurrenceEvidence } from '../../sync/occurrence';

export const updateBreakRule = rpc<
  BreakRuleInput & { id: string; organizationId: string; scopeSpaceIds?: SpaceScopeIds }
>('update_break_rule');
export const deleteBreakRule = rpc<{ id: string; organizationId: string; scopeSpaceIds?: SpaceScopeIds }>(
  'delete_break_rule',
);
export const endBreak = rpc<{
  userId: string;
  organizationId: string;
  notes?: string;
  breakId?: string;
  evidence?: OccurrenceEvidence;
}>('end_break');
export const getBreakStatus = rpc<{ userId: string; organizationId: string }>('get_break_status');
export const getBreaksForEntry = rpc<{
  timeEntryId: string;
  organizationId: string;
  requesterId: string;
  scopeSpaceIds: AttendanceScope;
}>('get_breaks_for_entry');
export const getActiveBreaks = rpc<{ organizationId: string; scopeSpaceIds?: AttendanceScope }>('get_active_breaks');
export const getBreakHistory = rpc<{
  scopeSpaceIds?: AttendanceScope;
  organizationId: string;
  date?: string;
  userId?: string;
  type?: string;
  page?: number;
  limit?: number;
}>('get_break_history');
export const addBreakForMember = rpc<{
  scopeSpaceIds?: AttendanceScope;
  timeEntryId: string;
  organizationId: string;
  editorId: string;
  type?: BreakType;
  startedAt: string | Date;
  endedAt: string | Date;
  reason: string;
}>('add_break_for_member');
export const deleteBreak = rpc<{
  breakId: string;
  organizationId: string;
  editorId: string;
  scopeSpaceIds?: AttendanceScope;
}>('delete_break');
export const endBreakManually = rpc<{
  scopeSpaceIds?: AttendanceScope;
  breakId: string;
  adminId: string;
  organizationId: string;
  notes?: string;
}>('end_break_manually');
export const getBreakSummary = rpc<{
  scopeSpaceIds?: AttendanceScope;
  organizationId: string;
  startDate: string;
  endDate: string;
  userId?: string;
}>('get_break_summary');
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
export const autoClockPlan = rpc<{ userId: string; organizationId: string }>('auto_clock_plan');
export const autoClockConsent = rpc<{ userId: string; organizationId: string; consent: boolean }>('auto_clock_consent');
export const autoClockUndo = rpc<{
  userId: string;
  organizationId: string;
  entryId: string;
  evidence?: OccurrenceEvidence;
}>('auto_clock_undo');
export const autoClockSkipRest = rpc<{
  userId: string;
  organizationId: string;
  entryId: string;
  evidence?: OccurrenceEvidence;
}>('auto_clock_skip_rest');
