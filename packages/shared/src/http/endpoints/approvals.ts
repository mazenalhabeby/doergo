/**
 * The approvals inbox — everything waiting for the caller to decide
 * (packages/shared/src/approvals). Gateway: modules/approvals.
 */
import type { ApprovalDecision, ApprovalKind, ApprovalRouting, ApprovalsCount, ApprovalsResponse } from '../../approvals';
import { defineEndpoints, endpoint } from '../core/define';
import { withQuery } from '../core/path';

export const approvalsEndpoints = defineEndpoints('approvals', {
  /** Live data, never kept offline: a decision made elsewhere must not reappear. */
  list: endpoint<void, ApprovalsResponse>({ method: 'GET', path: () => '/approvals', keep: false }),
  count: endpoint<void, ApprovalsCount>({ method: 'GET', path: () => '/approvals/count', keep: false }),
  /** Who else can decide one item of the caller's inbox, and who is told. */
  route: endpoint<{ kind: ApprovalKind; id: string }, ApprovalRouting>({ method: 'GET', path: (a) => withQuery('/approvals/route', { kind: a.kind, id: a.id }), keep: false }),
  decide: endpoint<void, { decided: true }, ApprovalDecision>({ method: 'POST', path: () => '/approvals/decide' }),
});
