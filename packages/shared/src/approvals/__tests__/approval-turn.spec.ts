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
    standInOfEarlier: false,
    left: ['hr'],
    heldLeft: ['hr'],
  };

  it('holds the last role still needed → waits for them, and they finish it', () => {
    expect(approvalTurn(base)).toMatchObject({ waitsForYou: true, youFinish: true, samePerson: false });
  });
  it('a stand-in of the first approver is the same person — never "waiting for you"', () => {
    expect(approvalTurn({ ...base, standInOfEarlier: true })).toMatchObject({
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
  const step = { firstByName: 'Anna', mine: false, agreedMinutes: 90, approverCount: 1 };
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
