import { ruleInsights } from '../approval-rule-insights';
import type { ApprovalRuleView, RuleFacts } from '../approval-rules';

const rule = (id: string, spaceId: string | null, minMinutes: number | null): ApprovalRuleView => ({
  id,
  kind: 'overtime',
  spaceId,
  minMinutes,
  minDays: null,
  minAmountCents: null,
  whenCoverShort: false,
  secondRoleId: 'r',
  remindAfterHours: null,
  escalateAfterHours: null,
  escalateRoleId: null,
  isActive: true,
});
const item = (minutes: number, space = 'a'): { facts: RuleFacts } => ({ facts: { spaceIds: [space], minutes } });

describe('ruleInsights', () => {
  const items = [60, 60, 90, 120, 120, 150, 180, 240, 300, 600, 720].map((m, i) => item(m, i > 8 ? 'b' : 'a'));

  it('counts what each rule would have taken, the way the server picks', () => {
    const got = ruleInsights('overtime', [rule('all', null, null), rule('big', 'b', 300)], items);
    expect(got.total).toBe(11);
    expect(got.perRule).toEqual({ all: 9, big: 2 });
    expect(got.uncovered).toBe(0);
  });

  it('suggests a limit near the 90th percentile and the big items no rule caught', () => {
    const got = ruleInsights('overtime', [], items);
    expect(got.suggestedLimit).toBe(300);
    expect(got.suggestions[0]).toEqual({ kind: 'overtime', spaceId: null, limit: 300, count: 2 });
  });

  it('says nothing with too few items, and nothing once a rule catches the big ones', () => {
    expect(ruleInsights('overtime', [], items.slice(0, 3)).suggestedLimit).toBeNull();
    expect(ruleInsights('overtime', [rule('x', null, 240)], items).suggestions).toEqual([]);
  });
});
