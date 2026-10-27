import { ruleInsights } from '../approval-rule-insights';
import { handChangedMinutes } from '../rule-item-facts';
import { mayDecideRuleKind, ruleKindsDecidedBy } from '../rule-deciders';
import { pickRule, requiredRoleIds, ruleInputProblem, ruleMatches, rulesThatApply } from '../approval-rules';
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

  it('counts every rule that applies to an item — they all apply (decision A, 2026-10-27)', () => {
    const got = ruleInsights('overtime', [rule('all', null, null), rule('big', 'b', 300)], items);
    expect(got.total).toBe(11);
    expect(got.perRule).toEqual({ all: 11, big: 2 });
    expect(got.uncovered).toBe(0);
  });

  it('a rule that only reminds catches nothing — the item is still decided by one person', () => {
    const remindOnly = { ...rule('nudge', null, null), secondRoleId: null, remindAfterHours: 4 };
    const got = ruleInsights('overtime', [remindOnly], items);
    expect(got.perRule).toEqual({ nudge: 11 });
    expect(got.uncovered).toBe(11);
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

/*
  ⚠️ Decision A (2026-10-27): every rule that fits an item applies. A workspace's own rule can no longer
  weaken the organization's — the item needs every approver the rules name, each a different person.
*/
describe('every rule that fits applies', () => {
  const r = (id: string, spaceId: string | null, minMinutes: number | null, secondRoleId: string | null) => ({
    ...rule(id, spaceId, minMinutes),
    secondRoleId,
  });
  const org = r('org', null, 120, 'admin');
  const site = r('site', 'a', 60, 'leader');

  it('names every role a fitting rule asks for, once', () => {
    expect(requiredRoleIds([org, site], { spaceIds: ['a'], minutes: 180 }).sort()).toEqual(['admin', 'leader']);
    expect(
      requiredRoleIds([org, site, r('again', 'a', 30, 'leader')], { spaceIds: ['a'], minutes: 180 }).sort(),
    ).toEqual(['admin', 'leader']);
  });

  it('a 3 h item in another workspace meets only the organization rule; 1 h 30 in "a" only the site rule', () => {
    expect(requiredRoleIds([org, site], { spaceIds: ['b'], minutes: 180 })).toEqual(['admin']);
    expect(requiredRoleIds([org, site], { spaceIds: ['a'], minutes: 90 })).toEqual(['leader']);
  });

  it('orders them: the workspace own, then the particular, then the higher limit — pickRule is the first', () => {
    expect(rulesThatApply([org, site], { spaceIds: ['a'], minutes: 180 }).map((x) => x.id)).toEqual(['site', 'org']);
    expect(pickRule([org, site], { spaceIds: ['a'], minutes: 180 })?.id).toBe('site');
  });

  it('a rule without a second role asks nobody more', () => {
    expect(requiredRoleIds([r('remind', null, null, null)], { spaceIds: [], minutes: 600 })).toEqual([]);
  });
});

describe('hours changed by hand', () => {
  const t = (hm: string) => `2026-10-20T${hm}:00Z`;
  it('an edit counts how far the times moved from what was clocked', () => {
    expect(
      handChangedMinutes({
        isEdited: true,
        originalClockIn: t('08:00'),
        originalClockOut: t('16:00'),
        clockInAt: t('07:30'),
        clockOutAt: t('17:00'),
      }),
    ).toBe(90);
  });
  it('hours the office TYPED IN (nothing ever clocked) are by hand from start to end', () => {
    expect(handChangedMinutes({ isEdited: true, clockInAt: t('06:00'), clockOutAt: t('18:00') })).toBe(720);
  });
  it('nothing edited is nothing changed', () => {
    expect(handChangedMinutes({ isEdited: false, clockInAt: t('06:00'), clockOutAt: t('18:00') })).toBe(0);
  });
});

/*
  ⚠️ A rule may only ask a role somebody can actually give the approval with: the kind's own route refuses
  everybody else first. Seen live — a rule asked a Sales Rep about changed hours, and the item waited forever.
*/
describe('who may give an approval of a rule kind', () => {
  const access = (org: Record<string, boolean>, perSpace: Record<string, Record<string, boolean>> = {}) =>
    ({ isAdmin: false, org, perSpace }) as never;
  it("the kind's own permission, org-wide or bridged", () => {
    expect(mayDecideRuleKind(access({ canApproveAttendance: true }), 'hours', null)).toBe(true);
    expect(mayDecideRuleKind(access({ crmWork: true }), 'hours', null)).toBe(false);
    // canViewAllTasks bridges to approving overtime (org-flags), as the session reads it.
    expect(mayDecideRuleKind(access({ canViewAllTasks: true }), 'overtime', null)).toBe(true);
  });
  it('in a workspace: only that workspace counts for a workspace rule, any for an every-workspace rule', () => {
    const a = access({}, { s1: { canManageAssets: true } });
    expect(mayDecideRuleKind(a, 'expense', 's1')).toBe(true);
    expect(mayDecideRuleKind(a, 'expense', 's2')).toBe(false);
    expect(mayDecideRuleKind(a, 'expense', null)).toBe(true);
  });
  it('lists the kinds a person could approve', () => {
    expect(ruleKindsDecidedBy(access({ canApproveAttendance: true }))).toEqual(['hours']);
  });
});
