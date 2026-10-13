/**
 * The approvals inbox — every kind's own list and action, run as the caller by
 * the gateway (packages/shared/src/approvals). Online only: a decision is never
 * queued, because somebody else may make it first.
 */
import { call, E } from './client';
import type { ApprovalDecision, ApprovalsCount, ApprovalsResponse } from '@hbcfield/shared/client';

export const approvalsApi = {
  list: async (): Promise<ApprovalsResponse> => {
    const r = await call(E.approvals.list);
    return (r?.items ? r : r?.data) ?? { items: [], unavailable: [], generatedAt: '' };
  },
  count: async (): Promise<ApprovalsCount> => {
    const r = await call(E.approvals.count);
    return (typeof r?.total === 'number' ? r : r?.data) ?? { total: 0, now: 0, byKind: {} };
  },
  decide: async (decision: ApprovalDecision): Promise<void> => {
    await call(E.approvals.decide, undefined, { body: decision });
  },
};
