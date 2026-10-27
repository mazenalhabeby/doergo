import { Injectable } from '@nestjs/common';
import { RULE_INSIGHT_DAYS, ruleInsights, type RuleInsights, type RuleKind } from '@hbcfield/shared';
import { ApprovalRulesAdminService } from './approval-rules-admin.service';
import { RuleFactsReader } from './rule-facts.reader';

/**
 * The rules page's numbers for one kind: what each rule would have taken over the last 90 days, what
 * no rule caught, a sensible limit and the rules worth adding. A READ — counts only, nothing is changed;
 * the items are read by the same reader the "nobody answers" sweep uses, so both see a kind alike.
 */
@Injectable()
export class ApprovalRuleInsightsService {
  constructor(
    private readonly admin: ApprovalRulesAdminService,
    private readonly facts: RuleFactsReader,
  ) {}

  async insights(organizationId: string, kind: RuleKind, spaceIds?: string[], now = new Date()): Promise<RuleInsights> {
    const since = new Date(now.getTime() - RULE_INSIGHT_DAYS * 86_400_000);
    // EVERY rule counts toward what is caught (an organization rule covers a workspace manager's items too);
    // only the manager's own rules are shown by name.
    const [rules, items] = await Promise.all([
      this.admin.listRules(organizationId),
      this.facts.read(organizationId, kind, { since, spaceIds }),
    ]);
    if (!spaceIds) return ruleInsights(kind, rules, items);
    // Held in some workspaces only: their items, nobody else's, and only rules they could add.
    const mine = items.filter((i) => i.facts.spaceIds.some((s) => spaceIds.includes(s)));
    const all = ruleInsights(kind, rules, mine);
    const theirs = new Set(rules.filter((r) => r.spaceId && spaceIds.includes(r.spaceId)).map((r) => r.id));
    return {
      ...all,
      perRule: Object.fromEntries(Object.entries(all.perRule).filter(([id]) => theirs.has(id))),
      // "Everywhere" is not theirs to add: with one workspace it is that workspace, otherwise left out.
      suggestions: all.suggestions
        .map((s) => (s.spaceId == null && spaceIds.length === 1 ? { ...s, spaceId: spaceIds[0]! } : s))
        .filter((s) => s.spaceId != null && spaceIds.includes(s.spaceId))
        .filter((s, i, list) => list.findIndex((o) => o.spaceId === s.spaceId) === i),
    };
  }
}
