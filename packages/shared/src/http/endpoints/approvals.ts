/**
 * The approvals inbox — everything waiting for the caller to decide
 * (packages/shared/src/approvals). Gateway: modules/approvals.
 */
import type { ApprovalDecision, ApprovalsCount, ApprovalsResponse } from '../../approvals';
import { defineEndpoints, endpoint } from '../core/define';

export const approvalsEndpoints = defineEndpoints('approvals', {
  /** Live data, never kept offline: a decision made elsewhere must not reappear. */
  list: endpoint<void, ApprovalsResponse>({ method: 'GET', path: () => '/approvals', keep: false }),
  count: endpoint<void, ApprovalsCount>({ method: 'GET', path: () => '/approvals/count', keep: false }),
  decide: endpoint<void, { decided: true }, ApprovalDecision>({ method: 'POST', path: () => '/approvals/decide' }),
});
