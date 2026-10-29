import { requiredRoleIds, rulesThatApply, type ApprovalRuleView, type RuleFacts } from "@hbcfield/shared/client"

/**
 * The rules of one kind as seen from ONE workspace: the company's (every-workspace) rules first, then the
 * workspace's own — exactly the rules an item there can meet. Seen from there, the company's rules are shown
 * and never changed (`editable: false`): they are edited under "Whole company", where every rule is listed.
 * `seen` null = the whole company: the rules as they are.
 */
export function seenRules(rules: ApprovalRuleView[], seen: string | null): ApprovalRuleView[] {
  if (!seen) return rules
  return [
    ...rules.filter((r) => !r.spaceId).map((r) => ({ ...r, editable: false })),
    ...rules.filter((r) => r.spaceId === seen),
  ]
}

/**
 * "Try an item": who must approve it besides the usual approver — the server's own reading (shared
 * `rulesThatApply` / `requiredRoleIds`: every rule that fits applies, each role a different person), over ALL
 * the rules of the kind, wherever the canvas is looking. Nothing is asked of the server.
 */
export function tryNeeds(rules: ApprovalRuleView[], facts: RuleFacts): { matched: Set<string>; roleIds: string[] } {
  return {
    matched: new Set(rulesThatApply(rules, facts).map((r) => r.id)),
    roleIds: requiredRoleIds(rules, facts),
  }
}
