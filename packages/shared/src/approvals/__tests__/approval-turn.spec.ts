import {
  agreedLine,
  approvalTurn,
  initialDecisionMinutes,
  matchesApprovalFilter,
  stepNoticeKind,
} from '../approval-turn';
import { standInCovers } from '../../access/delegation';

/*
  ONE rule for "whose turn is it" — the approval refuses by it, and the screens show it, so "Waiting for you" never
  promises what the approval then refuses (round 10: a stand-in was told "Your approval finishes it", then refused).
*/
describe('approvalTurn', () => {
  const base = {
    callerId: 'ben',
    admin: false,
    earlier: ['anna'],
    standInOf: [] as string[],
    left: ['hr'],
    heldLeft: ['hr'],
  };

  it('holds the last role still needed → waits for them, and they finish it', () => {
    expect(approvalTurn(base)).toMatchObject({ waitsForYou: true, youFinish: true, samePerson: false });
  });
  it('a stand-in of the first approver is the same person — never "waiting for you"', () => {
    expect(approvalTurn({ ...base, standInOf: ['anna'] })).toMatchObject({
      waitsForYou: false,
      youFinish: false,
      samePerson: true,
    });
  });
  it('already approved (first or a later one) → not again; Approve is hidden', () => {
    expect(approvalTurn({ ...base, earlier: ['anna', 'ben'] })).toMatchObject({
      youApproved: true,
      waitsForYou: false,
      samePerson: true,
    });
  });
  it('two roles still needed: holding one waits for them but does not finish it', () => {
    expect(approvalTurn({ ...base, left: ['hr', 'fin'] })).toMatchObject({ waitsForYou: true, youFinish: false });
  });
  it('the retry of a finished step (every role given, the write failed): anybody but the only approver finishes it', () => {
    expect(approvalTurn({ ...base, earlier: ['anna', 'ben'], left: [], heldLeft: [] })).toMatchObject({
      waitsForYou: true,
      youFinish: true,
    });
    expect(approvalTurn({ ...base, earlier: ['ben'], left: [], heldLeft: [] })).toMatchObject({
      samePerson: true,
      waitsForYou: false,
    });
  });
  it('…and a stand-in of the only approver is that same person', () => {
    expect(approvalTurn({ ...base, earlier: ['anna'], standInOf: ['anna'], left: [], heldLeft: [] })).toMatchObject({
      samePerson: true,
    });
  });
  it('an administrator who approved earlier (before becoming one) may still finish it', () => {
    expect(approvalTurn({ ...base, admin: true, earlier: ['ben'] })).toMatchObject({
      youApproved: true,
      waitsForYou: true,
    });
  });
  it('an administrator finishes it, and their own time stands', () => {
    expect(approvalTurn({ ...base, admin: true, heldLeft: [] })).toMatchObject({
      youFinish: true,
      adminFinishes: true,
    });
  });
});

describe('standInCovers (the stand-in rule over rows already read)', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const row = {
    fromUserId: 'anna',
    toUserId: 'ben',
    startsOn: d('2026-10-26'),
    endsOn: d('2026-10-30'),
    revokedAt: null,
  };
  it('either way round, overlapping the wait', () => {
    expect(standInCovers([row], 'ben', ['anna'], d('2026-10-28'), d('2026-10-28'))).toBe(true);
    expect(standInCovers([row], 'anna', ['ben'], d('2026-10-28'), d('2026-10-28'))).toBe(true);
  });
  it('ended before the first approval → never covered it', () => {
    expect(
      standInCovers([{ ...row, revokedAt: d('2026-10-27') }], 'ben', ['anna'], d('2026-10-28'), d('2026-10-28')),
    ).toBe(false);
  });
  it('somebody else → no', () =>
    expect(standInCovers([row], 'ben', ['karim'], d('2026-10-28'), d('2026-10-28'))).toBe(false));
});

describe('what the screens show', () => {
  const step = {
    firstById: 'anna',
    firstByName: 'Anna',
    roleName: 'HR',
    mine: false,
    agreedMinutes: 90,
    approverCount: 1,
  };
  it('the time starts at what was agreed; an agreed 0 is none', () => {
    expect(initialDecisionMinutes({ data: { requestedMinutes: 30 }, step })).toBe(90);
    expect(initialDecisionMinutes({ data: { requestedMinutes: 45 }, step: { ...step, agreedMinutes: 0 } })).toBe(45);
    expect(initialDecisionMinutes({ data: {} })).toBe(30);
  });
  it('the agreed line: named for one approver, "so far" for several, no "smaller counts" for an admin', () => {
    expect(agreedLine(step)).toEqual({ minutes: 90, who: 'Anna', smallerCounts: true });
    expect(agreedLine({ ...step, approverCount: 2 })?.who).toBeNull();
    expect(agreedLine({ ...step, adminFinishes: true })?.smallerCounts).toBe(false);
    expect(agreedLine({ ...step, youApproved: true })).toBeNull();
  });
  it('the sentence and the filter', () => {
    expect(stepNoticeKind({ ...step, youApproved: true })).toBe('youApproved');
    expect(stepNoticeKind({ ...step, waitsForYou: true, youFinish: true })).toBe('youFinish');
    expect(stepNoticeKind({ ...step, waitsForYou: true })).toBe('youCanGive');
    expect(matchesApprovalFilter({ kind: 'hours', step: { ...step, waitsForYou: true } }, 'waitsForYou')).toBe(true);
    expect(matchesApprovalFilter({ kind: 'hours' }, 'waitsForYou')).toBe(false);
  });
});

describe('approvedByNames', () => {
  it('everybody who approved, never only the first of several', () => {
    const { approvedByNames } = jest.requireActual('../approval-turn');
    expect(approvedByNames({ firstByName: 'Anna', approverNames: ['Anna', 'David'] })).toBe('Anna, David');
    expect(approvedByNames({ firstByName: 'Anna' })).toBe('Anna');
  });
});

describe('Approve follows the turn rule (round 11)', () => {
  const { approvalActionsFor } = jest.requireActual('../approval-items');
  const item = (step?: object) => ({ kind: 'extraTime', id: 'e1', canDecide: true, data: {}, step });
  const ids = (i: object) => approvalActionsFor(i).map((a: { id: string }) => a.id);
  it('offered when it waits for you, withheld when it does not (a stand-in, no missing role), Reject always', () => {
    expect(ids(item({ mine: false, waitsForYou: true }))).toContain('approve');
    expect(ids(item({ mine: false, waitsForYou: false }))).not.toContain('approve');
    expect(ids(item({ mine: false, waitsForYou: false }))).toContain('reject');
    expect(ids(item())).toContain('approve');
  });
});

describe('the shared screen helpers (round 11)', () => {
  const t = jest.requireActual('../approval-turn');
  it('filters: links, the fallback, days', () => {
    expect(t.filterFromQuery('yours', ['hours'])).toBe('waitsForYou');
    expect(t.filterFromQuery('hours', ['hours'])).toBe('hours');
    expect(t.filterFromQuery('nope', ['hours'])).toBeNull();
    expect(t.filterAfterRead('waitsForYou', [{ step: { waitsForYou: false } }])).toBe('all');
    expect(t.dayMatchesFilter([{ kind: 'hours', step: { waitsForYou: true } }], 'waitsForYou')).toBe(true);
  });
  it('the step sentence values: every approver, one count, a translated "administrator"', () => {
    const v = t.stepNoticeVars(
      {
        firstById: 'a',
        firstByName: 'Anna',
        roleName: '',
        mine: false,
        approverCount: 2,
        approverNames: ['Anna', 'David'],
      },
      { anAdministrator: 'ein Administrator', joinNames: (n: string[]) => n.join(' und ') },
    );
    expect(v).toEqual({ name: 'Anna und David', count: 2, role: 'ein Administrator' });
  });
  it('the agreed line key', () => {
    expect(t.agreedLineKey({ minutes: 90, who: 'Anna', smallerCounts: true })).toBe('agreedByCounts');
    expect(t.agreedLineKey({ minutes: 90, who: null, smallerCounts: false })).toBe('agreedSoFar');
  });
});
