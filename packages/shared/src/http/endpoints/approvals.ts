/**
 * The approvals inbox — everything waiting for the caller to decide
 * (packages/shared/src/approvals). Gateway: modules/approvals.
 */
import type {
  ApprovalDecision,
  ApprovalKind,
  ApprovalRouting,
  ApprovalsCount,
  ApprovalsResponse,
  StandInInput,
  StandInView,
  StandInsResponse,
  ApprovalRuleInput,
  ApprovalRuleView,
} from '../../approvals';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';

export const approvalsEndpoints = defineEndpoints('approvals', {
  /** Live data, never kept offline: a decision made elsewhere must not reappear. */
  list: endpoint<void, ApprovalsResponse>({ method: 'GET', path: () => '/approvals', keep: false }),
  count: endpoint<void, ApprovalsCount>({ method: 'GET', path: () => '/approvals/count', keep: false }),
  /** Who else can decide one item of the caller's inbox, and who is told. */
  route: endpoint<{ kind: ApprovalKind; id: string }, ApprovalRouting>({
    method: 'GET',
    path: (a) => withQuery('/approvals/route', { kind: a.kind, id: a.id }),
    keep: false,
  }),
  /** Hand-overs of approval decisions: mine, for me, and (people managers) everybody's. */
  standIns: endpoint<void, StandInsResponse>({ method: 'GET', path: () => '/approvals/stand-ins', keep: false }),
  createStandIn: endpoint<void, StandInView, StandInInput>({ method: 'POST', path: () => '/approvals/stand-ins' }),
  endStandIn: endpoint<{ id: string }, { ended: true }, Record<string, never>>({
    method: 'POST',
    path: (a) => path`/approvals/stand-ins/${a.id}/end`,
  }),
  /** The office's rules: past a threshold, a second approval by a role. */
  rules: endpoint<void, ApprovalRuleView[]>({ method: 'GET', path: () => '/approvals/rules', keep: false }),
  createRule: endpoint<void, { id: string }, ApprovalRuleInput>({ method: 'POST', path: () => '/approvals/rules' }),
  updateRule: endpoint<{ id: string }, { id: string }, ApprovalRuleInput>({
    method: 'PATCH',
    path: (a) => path`/approvals/rules/${a.id}`,
  }),
  deleteRule: endpoint<{ id: string }, { deleted: true }>({
    method: 'DELETE',
    path: (a) => path`/approvals/rules/${a.id}`,
  }),
  decide: endpoint<void, { decided: true; stage?: 'FIRST_STEP'; waitingFor?: string }, ApprovalDecision>({
    method: 'POST',
    path: () => '/approvals/decide',
  }),
});
