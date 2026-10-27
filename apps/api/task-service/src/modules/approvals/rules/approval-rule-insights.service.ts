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
    const [rules, items] = await Promise.all([
      this.admin.listRules(organizationId, spaceIds),
      this.facts.read(organizationId, kind, { since }),
    ]);
    // Held in some workspaces only: their items, nobody else's.
    const mine = spaceIds ? items.filter((i) => i.facts.spaceIds.some((s) => spaceIds.includes(s))) : items;
    return ruleInsights(kind, rules, mine);
  }
}
