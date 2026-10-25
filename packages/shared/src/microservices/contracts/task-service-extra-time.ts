/** task-service: extra time on a shift — ask, approve, add, remove, reject, waiting list. */
import { rpc } from '../contract';
import type { ExtraTimeDecisionMessage } from './task-service-types';
import type { AttendanceScope } from '../../access/space-scope';

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

/** Time worked outside the planned shift (attendance/outside-shift.ts): the leaders' list, the member's own, the decision. */
export const listOutsideShift = rpc<{ userId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }>(
  'list_outside_shift',
);
export const listMyOutsideShift = rpc<{ userId: string; organizationId: string }>('list_my_outside_shift');
/** Who decides the caller's time today — named on the phone's clock-out receipt (clock review C7). */
export const listMyApprovers = rpc<{ userId: string; organizationId: string }>('list_my_approvers');
export const decideOutsideShift = rpc<{
  approverId: string;
  organizationId: string;
  entryId: string;
  /** How many of the minutes count — all, part, or 0 = don't count. */
  minutes: number;
  reason?: string | null;
  scopeSpaceIds?: AttendanceScope;
}>('decide_outside_shift');
