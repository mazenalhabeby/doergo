/** task-service: approvals — who else may decide, stand-ins, second steps, office rules. */
import { rpc } from '../contract';
import type { ApprovalRouteInput, StandInCaller } from './task-service-types';
import type { ApprovalRuleInput, ApprovalRuleView, ApprovalStepView, RuleKind } from '../../approvals/approval-rules';
import type { RuleInsights } from '../../approvals/approval-rule-insights';
import type { ApprovalRouting, StandInInput, StandInView, StandInsResponse } from '../../approvals/approval-routing';

export const approvalRouteRpc = rpc<
  ApprovalRouteInput & {
    /** Sent by the gateway; the service derives both from `kind` and ignores these. */ decideKey?: unknown;
    orgWide?: unknown;
  },
  ApprovalRouting
>('approval_route');

export const standInsList = rpc<{ caller: StandInCaller }, StandInsResponse>('stand_ins_list');

export const standInsCreate = rpc<{ caller: StandInCaller; input: StandInInput }, StandInView>('stand_ins_create');

export const standInsEnd = rpc<{ caller: StandInCaller; id: string }, { ended: true; toUserId: string }>(
  'stand_ins_end',
);

export const approvalSteps = rpc<
  { organizationId: string; items: Array<{ kind: RuleKind; itemId: string }> },
  ApprovalStepView[]
>('approval_steps');

/**
 * `spaceIds` = the caller holds "manage approval rules" only in these workspaces: they see and change only
 * those workspaces' rules (absent = org-wide). The SERVICE enforces it.
 */
export const approvalRulesList = rpc<{ organizationId: string; spaceIds?: string[] }, ApprovalRuleView[]>(
  'approval_rules_list',
);

export const approvalRulesSave = rpc<
  { organizationId: string; userId: string; input: ApprovalRuleInput; id?: string; spaceIds?: string[] },
  { id: string }
>('approval_rules_save');

export const approvalRulesInsights = rpc<{ organizationId: string; kind: RuleKind; spaceIds?: string[] }, RuleInsights>(
  'approval_rules_insights',
);

/** For each role: the rule kinds at least one of its holders could approve (the rules page marks the others). */
export const approvalRuleRoleKinds = rpc<{ organizationId: string; roleIds: string[] }, Record<string, RuleKind[]>>(
  'approval_rule_role_kinds',
);

export const approvalRulesDelete = rpc<{ organizationId: string; id: string; spaceIds?: string[] }, { deleted: true }>(
  'approval_rules_delete',
);
