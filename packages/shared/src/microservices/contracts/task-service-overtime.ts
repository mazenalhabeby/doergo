/** task-service: overtime — what is running, waiting, the history and one round. */
import { rpc } from '../contract';
import type { SpaceScopeIds } from '../../access/space-scope';

export const getActiveOvertime = rpc<{ userId: string }>('get_active_overtime');

export const getPendingOvertimeApprovals = rpc<{ organizationId: string; scopeSpaceIds?: SpaceScopeIds }>(
  'get_pending_overtime_approvals',
);

export const getOvertimeHistory = rpc<{
  organizationId: string;
  scopeSpaceIds?: SpaceScopeIds;
  technicianId?: string;
  spaceId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}>('get_overtime_history');

export const getOvertimeSummary = rpc<{
  organizationId: string;
  scopeSpaceIds?: SpaceScopeIds;
  technicianId?: string;
  spaceId?: string;
  from?: string;
  to?: string;
}>('get_overtime_summary');

export const getOvertimeRound = rpc<{ id: string; organizationId: string; scopeSpaceIds?: SpaceScopeIds }>(
  'get_overtime_round',
);
