/**
 * The approvals inbox (packages/shared/src/approvals + ApprovalsService): it
 * READS the existing pending lists and DECIDES through their existing routes,
 * as the caller — so these pin the mapping, the grouping, and that nothing is
 * asked for, shown or pressed that the caller may not.
 */
import {
  approvalActionsFor,
  approvalRoute,
  dedupeApprovals,
  sortApprovals,
  toApproval,
  type ApprovalContext,
  type ApprovalItem,
} from '@hbcfield/shared';
import { ApprovalsService, mayDecide } from '../approvals.service';

const now = new Date('2026-10-13T12:00:00Z');
const ctx = (decide = true): ApprovalContext => ({ now, me: 'me', mayDecide: () => decide });
const H = 3_600_000;
const at = (h: number) => new Date(now.getTime() + h * H).toISOString();

describe('which existing route a decision calls', () => {
  it('maps every kind to its own route and body', () => {
    expect(approvalRoute({ kind: 'hours', id: 'e1', action: 'approve' })).toEqual({ ok: true, method: 'POST', path: '/attendance/approvals/e1/approve', body: {} });
    expect(approvalRoute({ kind: 'request', id: 't1', action: 'reject', reason: 'cover' })).toMatchObject({ method: 'PATCH', path: '/employees/time-off/t1/approve', body: { approved: false, rejectionReason: 'cover' } });
    expect(approvalRoute({ kind: 'extraTime', id: 'e2', action: 'approve', minutes: 45 })).toMatchObject({ path: '/attendance/extra-time/e2/approve', body: { minutes: 45 } });
    expect(approvalRoute({ kind: 'expense', id: 'x', action: 'reject', reason: 'no receipt' })).toMatchObject({ path: '/assets/expenses/x/review', body: { decision: 'reject', note: 'no receipt' } });
    expect(approvalRoute({ kind: 'guestRequest', id: 'g', action: 'reject' })).toMatchObject({ method: 'PATCH', path: '/share-requests/g/resolve', body: { approve: false } });
    expect(approvalRoute({ kind: 'clientRequest', id: 'c', action: 'approve', spaceId: 's1' })).toMatchObject({ path: '/portal/admin/requests/c/triage', body: { spaceId: 's1' } });
  });
  it('refuses what the route would refuse anyway, before calling it', () => {
    expect(approvalRoute({ kind: 'hours', id: 'e1', action: 'reject' })).toEqual({ ok: false, code: 'APPROVAL_INVALID', field: 'reason' });
    expect(approvalRoute({ kind: 'overtime', id: 'o', action: 'approve' })).toMatchObject({ ok: false, field: 'minutes' });
    expect(approvalRoute({ kind: 'noShow', id: 'n', action: 'reject' })).toMatchObject({ ok: false, field: 'action' });
    expect(approvalRoute({ kind: 'clientRequest', id: 'c', action: 'approve' })).toMatchObject({ ok: false, field: 'spaceId' });
  });
  it('an id is a path segment, never a path', () => {
    expect(approvalRoute({ kind: 'hours', id: '../../users/x', action: 'approve' })).toMatchObject({ path: '/attendance/approvals/..%2F..%2Fusers%2Fx/approve' });
  });
});

describe('what comes first', () => {
  it('somebody away from site, or still working past their shift, is NOW', () => {
    expect(toApproval.away({ id: 'a', user: { firstName: 'J' } }, ctx()).group).toBe('NOW');
    expect(toApproval.extraTime({ id: 'e', status: 'CLOCKED_IN' }, ctx()).group).toBe('NOW');
    expect(toApproval.extraTime({ id: 'e', status: 'CLOCKED_OUT' }, ctx()).group).toBe('TODAY');
  });
  it('a no-show is NOW while the shift runs, TODAY just after, LATER from last week', () => {
    expect(toApproval.noShow({ id: 'n', expectedClockOutAt: at(2) }, ctx()).group).toBe('NOW');
    expect(toApproval.noShow({ id: 'n', expectedClockOutAt: at(-3) }, ctx()).group).toBe('TODAY');
    expect(toApproval.noShow({ id: 'n', expectedClockOutAt: at(-72) }, ctx()).group).toBe('LATER');
  });
  it('leave starting within two days is TODAY, next month is LATER', () => {
    expect(toApproval.request({ id: 't', startDate: at(30) }, ctx()).group).toBe('TODAY');
    expect(toApproval.request({ id: 't', startDate: at(24 * 20) }, ctx()).group).toBe('LATER');
  });
  it('sorts NOW, TODAY, LATER — then what runs out first, then the oldest', () => {
    const mk = (id: string, group: ApprovalItem['group'], dueAt: string | null, raisedAt: string): ApprovalItem =>
      ({ kind: 'hours', id, group, dueAt, raisedAt, subject: { id: null, name: '' }, space: null, canDecide: true, data: {} });
    const out = sortApprovals([mk('l', 'LATER', null, at(-1)), mk('t2', 'TODAY', null, at(-5)), mk('n', 'NOW', null, at(-1)), mk('t1', 'TODAY', at(1), at(-1))]);
    expect(out.map((i) => i.id)).toEqual(['n', 't1', 't2', 'l']);
  });
});

describe('each shift once', () => {
  it('the live extra-time item wins over the overtime row of the same shift', () => {
    const extra = toApproval.extraTime({ id: 'entry-1', status: 'CLOCKED_IN' }, ctx());
    const ot = toApproval.overtime({ id: 'ot-1', timeEntryId: 'entry-1' }, ctx());
    const other = toApproval.overtime({ id: 'ot-2', timeEntryId: 'entry-2' }, ctx());
    expect(dedupeApprovals([extra, ot, other]).map((i) => i.id)).toEqual(['entry-1', 'ot-2']);
  });
});

describe('buttons', () => {
  it('none for an item the caller may not decide, or one that needs its page', () => {
    expect(approvalActionsFor(toApproval.hours({ id: 'e' }, ctx(false)))).toEqual([]);
    expect(approvalActionsFor(toApproval.assetProposal({ id: 'p', categoryId: null }, ctx()))).toEqual([]);
    expect(approvalActionsFor(toApproval.assetProposal({ id: 'p', categoryId: 'k1' }, ctx())).map((a) => a.id)).toEqual(['approve', 'reject']);
  });
});

describe('mayDecide — the rule the action route guard reads', () => {
  const user = (over: any) => ({ id: 'me', role: 'EMPLOYEE', access: { org: {}, perSpace: {} }, ...over });
  it('org-wide holder: everywhere; workspace holder: only there; nobody else', () => {
    expect(mayDecide(user({ canApproveAttendance: true }), 'hours', 's9')).toBe(true);
    const sp = user({ access: { org: {}, perSpace: { s1: { canApproveAttendance: true } } } });
    expect(mayDecide(sp, 'hours', 's1')).toBe(true);
    expect(mayDecide(sp, 'hours', 's2')).toBe(false);
    expect(mayDecide(user({}), 'hours', 's1')).toBe(false);
  });
  it('an org-wide kind is never decided through a workspace grant', () => {
    expect(mayDecide(user({ access: { org: {}, perSpace: { s1: { canIssueDocuments: true } } } }), 'document', null)).toBe(false);
    expect(mayDecide(user({ role: 'ADMIN' }), 'document', null)).toBe(true);
  });
});

describe('ApprovalsService — reads as the caller, asks only what they could decide', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  const config = { get: (k: string) => (k === 'PORT' ? '4000' : undefined) } as any;
  const caller = (user: any) => ({ user: { id: 'me', role: 'EMPLOYEE', access: { org: {}, perSpace: {} }, ...user }, headers: { authorization: 'Bearer t' } });
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as any;

  it('a member with no decision rights: not one list is asked for', async () => {
    const f = jest.fn();
    global.fetch = f as any;
    const res = await new ApprovalsService(config).list(caller({}));
    expect(f).not.toHaveBeenCalled();
    expect(res.items).toEqual([]);
  });

  it('asks the caller\'s lists with the caller\'s token, keeps only what they may decide, survives one failing list', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string, init: any) => {
      calls.push(String(url).replace('http://127.0.0.1:4000/api/v1', ''));
      expect(init.headers.authorization).toBe('Bearer t');
      if (String(url).includes('/attendance/approvals/pending')) return json({ data: [{ id: 'e1', location: { id: 's1', name: 'A' }, clockOutAt: at(-2) }, { id: 'e2', location: { id: 's2', name: 'B' }, clockOutAt: at(-2) }] });
      if (String(url).includes('/attendance/excursions')) return json({}, 500);
      return json({ data: [] });
    }) as any;
    const svc = new ApprovalsService(config);
    const res = await svc.list(caller({ access: { org: {}, perSpace: { s1: { canApproveAttendance: true } } } }));
    expect(res.items.map((i) => i.id)).toEqual(['e1']); // s2 is not theirs to decide
    expect(res.unavailable).toContain('away');
    expect(calls.some((c) => c.startsWith('/documents'))).toBe(false); // holds nothing there
    expect((await svc.count(caller({ access: { org: {}, perSpace: { s1: { canApproveAttendance: true } } } }))).total).toBe(1);
  });

  it('never lists the caller\'s own item — every kind refuses deciding about yourself', async () => {
    global.fetch = jest.fn(async (url: string) =>
      String(url).includes('/attendance/approvals/pending')
        ? json({ data: [{ id: 'mine', user: { id: 'me' }, location: { id: 's1', name: 'A' }, clockOutAt: at(-2) }, { id: 'theirs', user: { id: 'u2' }, location: { id: 's1', name: 'A' }, clockOutAt: at(-2) }] })
        : json({ data: [] })) as any;
    const res = await new ApprovalsService(config).list(caller({ access: { org: {}, perSpace: { s1: { canApproveAttendance: true } } } }));
    expect(res.items.map((i) => i.id)).toEqual(['theirs']);
  });

  it('a refusal from the kind\'s own route comes back as it was', async () => {
    global.fetch = jest.fn(async () => json({ code: 'SELF_APPROVAL', message: 'You cannot approve your own' }, 403)) as any;
    const r = await new ApprovalsService(config).decide(caller({}), { kind: 'hours', id: 'e1', action: 'approve' });
    expect(r).toMatchObject({ ok: false, status: 403, code: 'SELF_APPROVAL' });
  });
});

describe('why you see it, and who else could decide', () => {
  const { decideVia, sortDeciders } = jest.requireActual('@hbcfield/shared');
  const access = (org: Record<string, boolean>, perSpace: Record<string, Record<string, boolean>> = {}) => ({ org, perSpace });

  it('an administrator decides anything', () => {
    expect(decideVia({ isAdmin: true, access: null }, 'document', null)).toBe('ADMIN');
  });

  it('org-wide through a role, or through a broader key bridged to it', () => {
    expect(decideVia({ isAdmin: false, access: access({ canApproveAttendance: true }) }, 'hours', 's1')).toBe('ORG');
    // canManageUsers carries the rota org-wide (ORG_FLAG_BRIDGES) — as the request user's flags do.
    expect(decideVia({ isAdmin: false, access: access({ canManageUsers: true }) }, 'request', 's1')).toBe('ORG');
  });

  it('a workspace grant decides THAT workspace only, and never an org-wide kind', () => {
    const a = access({}, { s1: { canApproveAttendance: true, canIssueDocuments: true } });
    expect(decideVia({ isAdmin: false, access: a }, 'hours', 's1')).toBe('SPACE');
    expect(decideVia({ isAdmin: false, access: a }, 'hours', 's2')).toBeNull();
    expect(decideVia({ isAdmin: false, access: a }, 'document', null)).toBeNull();
  });

  it('who else: on duty first, then the workspace before the whole organization', () => {
    const d = (name: string, via: string, onLeave = false) => ({ id: name, name, avatarUrl: null, via, onLeave });
    expect(sortDeciders([d('Zoe', 'ADMIN'), d('Ali', 'ORG', true), d('Ben', 'SPACE'), d('Cy', 'ORG')]).map((x: any) => x.name))
      .toEqual(['Ben', 'Cy', 'Zoe', 'Ali']);
  });
});

describe('a stand-in', () => {
  const { withStandIn, ownAccess, delegatedGrant, standInDatesProblem } = jest.requireActual('@hbcfield/shared');
  const { whyCallerDecides } = jest.requireActual('../approvals.service');
  const { actorPermsForSpace } = jest.requireActual('../../space-roles/space-member-access');
  const leader = { org: {}, perSpace: { s1: { canApproveAttendance: true, canManageAssets: true, canGrantSpaceRoles: true } } };
  const grant = delegatedGrant(leader, false);
  const deputyOwn = { org: {}, perSpace: { s2: { canViewAllTasks: true } } };
  const deputy = { id: 'd', role: 'EMPLOYEE', access: withStandIn(deputyOwn, grant, [{ userId: 'lea', name: 'Lea Lang' }]) };

  it('carries only the approval keys, where the leader holds them — never money or role-giving', () => {
    expect(grant).toEqual({ org: {}, perSpace: { s1: { canApproveAttendance: true } } });
  });

  it('is never a grant ceiling: what they may hand on is their own', () => {
    expect(actorPermsForSpace(deputy, 's1')).toEqual({});
    expect(ownAccess(deputy.access)).toMatchObject({ org: {}, perSpace: deputyOwn.perSpace });
  });

  it('their items say whose decisions they cover', () => {
    const item: any = { kind: 'hours', id: 'e', space: { id: 's1', name: 'A' }, subject: { id: 'x', name: 'X' } };
    expect(whyCallerDecides(deputy, item)).toEqual({ via: 'DELEGATED', fromName: 'Lea Lang' });
  });

  it('days: whole days, not over, at most the limit', () => {
    expect(standInDatesProblem('2026-10-20', '2026-10-24', '2026-10-13', 60)).toBeNull();
    expect(standInDatesProblem('2026-10-24', '2026-10-20', '2026-10-13', 60)).toBe('STAND_IN_DATES_INVALID');
    expect(standInDatesProblem('2026-10-01', '2026-10-05', '2026-10-13', 60)).toBe('STAND_IN_IN_THE_PAST');
    expect(standInDatesProblem('2026-10-13', '2027-01-01', '2026-10-13', 60)).toBe('STAND_IN_TOO_LONG');
  });
});

describe('office rules — which rule applies', () => {
  const { ruleMatches, pickRule, ruleInputProblem, approvalActionsFor } = jest.requireActual('@hbcfield/shared');
  const { firstStepOf } = jest.requireActual('../approvals.service');
  const r = (o: any) => ({ kind: 'overtime', spaceId: null, minMinutes: null, minDays: null, minAmountCents: null, isActive: true, ...o });

  it('strictly MORE than the threshold; no threshold = always; off = never', () => {
    expect(ruleMatches(r({ minMinutes: 120 }), { spaceIds: [], minutes: 120 })).toBe(false);
    expect(ruleMatches(r({ minMinutes: 120 }), { spaceIds: [], minutes: 121 })).toBe(true);
    expect(ruleMatches(r({}), { spaceIds: [] })).toBe(true);
    expect(ruleMatches(r({ isActive: false }), { spaceIds: [] })).toBe(false);
  });

  it('a workspace\'s own rule before an every-workspace one, then the highest threshold', () => {
    const everywhere = r({ id: 'a', minMinutes: 60 });
    const site = r({ id: 'b', spaceId: 's1', minMinutes: 30 });
    expect(pickRule([everywhere, site], { spaceIds: ['s1'], minutes: 90 }).id).toBe('b');
    expect(pickRule([everywhere, site], { spaceIds: ['s2'], minutes: 90 }).id).toBe('a');
  });

  it('a rule as entered is checked', () => {
    expect(ruleInputProblem({ kind: 'overtime', secondRoleId: '' })).toBe('RULE_EMPTY');
    expect(ruleInputProblem({ kind: 'expense', secondRoleId: 'x', minAmountCents: -1 })).toBe('RULE_THRESHOLD_INVALID');
    expect(ruleInputProblem({ kind: 'expense', secondRoleId: 'x', minAmountCents: 20000 })).toBeNull();
  });

  it('a step-1 answer is read through any envelope; the first approver sees only reject', () => {
    expect(firstStepOf({ success: true, data: { data: { stage: 'FIRST_STEP', waitingFor: 'Finance' } } })).toBe('Finance');
    expect(firstStepOf({ success: true, data: { id: 'x' } })).toBeNull();
    const item: any = { kind: 'expense', id: 'e', canDecide: true, data: {}, step: { mine: true } };
    expect(approvalActionsFor(item).map((a: any) => a.id)).toEqual(['reject']);
  });
});

describe('office rules — cover and nobody answering', () => {
  const { ruleMatches, noticeDue, ruleInputProblem } = jest.requireActual('@hbcfield/shared');
  const r = (o: any) => ({ kind: 'request', spaceId: null, minMinutes: null, minDays: null, minAmountCents: null, isActive: true, ...o });

  it('the cover condition holds only when the leave would leave too few people', () => {
    expect(ruleMatches(r({ whenCoverShort: true }), { spaceIds: [], coverShort: true })).toBe(true);
    expect(ruleMatches(r({ whenCoverShort: true }), { spaceIds: [], coverShort: false })).toBe(false);
    expect(ruleMatches(r({ whenCoverShort: true, minDays: 3 }), { spaceIds: [], coverShort: true, days: 2 })).toBe(false);
  });

  it('reminder first, escalation later, each once', () => {
    const rule = { remindAfterHours: 4, escalateAfterHours: 24, escalateRoleId: 'f' };
    const since = new Date('2026-10-20T00:00:00Z');
    const at = (h: number) => new Date(since.getTime() + h * 3_600_000);
    expect(noticeDue(rule, since, at(3), new Set())).toBeNull();
    expect(noticeDue(rule, since, at(5), new Set())).toBe('REMIND');
    expect(noticeDue(rule, since, at(5), new Set(['REMIND']))).toBeNull();
    expect(noticeDue(rule, since, at(25), new Set(['REMIND']))).toBe('ESCALATE');
    expect(noticeDue(rule, since, at(30), new Set(['ESCALATE']))).toBeNull();
  });

  it('a rule must do something, and an escalation needs a role', () => {
    expect(ruleInputProblem({ kind: 'request' })).toBe('RULE_EMPTY');
    expect(ruleInputProblem({ kind: 'request', escalateAfterHours: 24 })).toBe('RULE_ESCALATE_ROLE_REQUIRED');
    expect(ruleInputProblem({ kind: 'request', remindAfterHours: 4 })).toBeNull();
  });
});
