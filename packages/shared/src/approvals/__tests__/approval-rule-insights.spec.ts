import { ruleInsights } from '../approval-rule-insights';
import { pickRule, ruleInputProblem, ruleMatches } from '../approval-rules';
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
  categoryId: null,
  urgentOnly: false,
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

describe('the new rule kinds', () => {
  const base = { spaceId: null, minMinutes: null, minDays: null, minAmountCents: null, isActive: true };
  it('hours: changed by hand by more than the limit; no-shows: more days in a row than the limit', () => {
    expect(ruleMatches({ ...base, kind: 'hours', minMinutes: 30 }, { spaceIds: [], minutes: 45 })).toBe(true);
    expect(ruleMatches({ ...base, kind: 'hours', minMinutes: 30 }, { spaceIds: [], minutes: 30 })).toBe(false);
    expect(ruleMatches({ ...base, kind: 'noShow', minDays: 2 }, { spaceIds: [], days: 3 })).toBe(true);
  });
  it('asset papers: one asset kind; client requests: urgent only — and the particular rule wins', () => {
    const anyKind = { ...base, id: 'any', kind: 'assetProposal' as const };
    const vans = { ...base, id: 'vans', kind: 'assetProposal' as const, categoryId: 'van' };
    expect(pickRule([anyKind, vans], { spaceIds: [], categoryId: 'van' })?.id).toBe('vans');
    expect(pickRule([anyKind, vans], { spaceIds: [], categoryId: 'laptop' })?.id).toBe('any');
    const urgent = { ...base, kind: 'clientRequest' as const, urgentOnly: true };
    expect(ruleMatches(urgent, { spaceIds: [], urgent: false })).toBe(false);
    expect(ruleMatches(urgent, { spaceIds: [], urgent: true })).toBe(true);
  });
  it('a limit is checked against its own kind only', () => {
    expect(ruleInputProblem({ kind: 'noShow', minDays: 400, secondRoleId: 'r' })).toBe('RULE_THRESHOLD_INVALID');
    expect(ruleInputProblem({ kind: 'clientRequest', urgentOnly: true, secondRoleId: 'r' })).toBeNull();
  });
});
