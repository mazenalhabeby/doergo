/** task-service: rests — start, snooze, end, rules, history, summary. */
import { rpc } from '../contract';
import type { BreakRuleInput } from './task-service-types';
import type { AttendanceScope, SpaceScopeIds } from '../../access/space-scope';
import type { OccurrenceEvidence } from '../../sync/occurrence';
import type { BreakType as BreakTypeEnum } from '../../types/enums';

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

/*
  The break kinds as their string values. Shared never imports generated Prisma types: the web and the
  console build shared without a Prisma client, so a type from '@prisma/client' breaks their image builds.
*/
type BreakType = `${BreakTypeEnum}`;

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
