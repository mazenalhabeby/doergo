import { orgFlagFields } from '../access/org-flags';
import { spacesGranting, type ResolvedAccess } from '../types/permissions';
import type { ApprovalKind } from './approval-kinds';
import { APPROVAL_KIND_SPECS } from './kinds/kind-specs';
import { RULE_KINDS, type RuleKind } from './approval-rules';

/** The inbox kind whose own approve route decides a rule kind's items — its permission is what an approver needs. */
const RULE_APPROVAL_KIND: Record<RuleKind, ApprovalKind> = {
  overtime: 'overtime',
  request: 'request',
  expense: 'expense',
  hours: 'hours',
  noShow: 'noShow',
  assetProposal: 'assetProposal',
  clientRequest: 'clientRequest',
};

/** The permission a person needs to give ANY approval of a rule kind (the kind's own route asks it first). */
export const ruleDecideKey = (kind: RuleKind) => APPROVAL_KIND_SPECS[RULE_APPROVAL_KIND[kind]].decideKey;

/**
 * Could this person approve items of a rule kind — org-wide (bridges included, as the session reads them), or in
 * the rule's workspace (any workspace for a rule that covers all)? A rule naming a role whose holders all answer
 * no would leave its items waiting for an approval nobody can give.
 */
export function mayDecideRuleKind(access: ResolvedAccess, kind: RuleKind, spaceId: string | null): boolean {
  const key = ruleDecideKey(kind);
  if (orgFlagFields(access)[key]) return true;
  const spaces = spacesGranting(access, key);
  return spaces === null || (spaceId ? spaces.includes(spaceId) : spaces.length > 0);
}

/** Every rule kind this person could approve somewhere — for marking the roles a rule may name. */
export function ruleKindsDecidedBy(access: ResolvedAccess): RuleKind[] {
  return RULE_KINDS.filter((k) => mayDecideRuleKind(access, k, null));
}
