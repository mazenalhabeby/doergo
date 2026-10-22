/**
 * The member's vacation balance on the phone: the server's answer read
 * safely, and its ledger lines turned into the rows the Requests tab draws.
 */
import { leaveBalance } from '@hbcfield/shared/client';
import { balanceRows, carryNote, leaveYearLabel, readLeaveBalance, signedDays } from '../leave-balance';
import { balancePreview } from '../../features/requests/request-model';

/** Mark's year from the approved mockup: 25, −10 before HBCField, +2 carried, −3 taken = 14. */
const mark = leaveBalance({
  allowance: 25,
  adjustments: [{ kind: 'OPENING_USED', days: -10 }, { kind: 'CARRY_OVER', days: 2 }],
  taken: 3,
  pending: 0,
});
const current = {
  year: 2026, ...mark,
  leaveYear: { start: '2026-01-01', end: '2026-12-31', mode: 'CALENDAR' },
  carryExpiresOn: '2026-03-31',
};

describe('reading the answer', () => {
  it('a current server: the lines, the leave year and the carry expiry', () => {
    const b = readLeaveBalance(current)!;
    expect(b.remaining).toBe(14);
    expect(b.leaveYear).toEqual({ start: '2026-01-01', end: '2026-12-31', mode: 'CALENDAR' });
    expect(b.lines?.map((l) => l.key)).toEqual(['ALLOWANCE', 'OPENING_USED', 'CARRY_OVER', 'TAKEN']);
    expect(b.carryExpiresOn).toBe('2026-03-31');
  });
  it('an older server: the old figures only — no lines, so no breakdown is guessed', () => {
    const b = readLeaveBalance({ year: 2026, allowance: 25, taken: 3, pending: 1, remaining: 22 })!;
    expect(b).toMatchObject({ remaining: 22, pending: 1, lines: null, leaveYear: null, carryExpiresOn: null });
    expect(balanceRows(b)).toBeNull();
  });
  it('not a balance at all is null; unknown line keys and a bad leave year are dropped', () => {
    expect(readLeaveBalance(null)).toBeNull();
    expect(readLeaveBalance({ year: 2026 })).toBeNull();
    const b = readLeaveBalance({ remaining: 5, lines: [{ key: 'ALLOWANCE', days: 5 }, { key: 'BONUS', days: 9 }, { key: 'TAKEN', days: 'x' }], leaveYear: { start: 'x', end: '2026-12-31', mode: 'CALENDAR' } })!;
    expect(b.lines).toEqual([{ key: 'ALLOWANCE', days: 5 }]);
    expect(b.leaveYear).toBeNull();
  });
});

describe('lines → rows', () => {
  it('the allowance unsigned, every change signed with a true minus, in the server order', () => {
    expect(balanceRows(readLeaveBalance(current))).toEqual([
      { key: 'ALLOWANCE', labelKey: 'requests.ledger.line.ALLOWANCE', days: 25, value: '25' },
      { key: 'OPENING_USED', labelKey: 'requests.ledger.line.OPENING_USED', days: -10, value: '−10' },
      { key: 'CARRY_OVER', labelKey: 'requests.ledger.line.CARRY_OVER', days: 2, value: '+2' },
      { key: 'TAKEN', labelKey: 'requests.ledger.line.TAKEN', days: -3, value: '−3' },
    ]);
  });
  it('half days go through the locale formatter', () => {
    const de = (n: number) => String(n).replace('.', ',');
    expect(signedDays(-2.5, de)).toBe('−2,5');
    expect(signedDays(0)).toBe('0');
  });
});

describe('the leave year and the carry note', () => {
  const day = (k: string) => k.slice(5);
  it('calendar year names the year; a work year names its two ends', () => {
    expect(leaveYearLabel(readLeaveBalance(current), day)).toEqual({ key: 'requests.ledger.yearCalendar', values: { year: '2026' } });
    const work = readLeaveBalance({ ...current, leaveYear: { start: '2026-04-15', end: '2027-04-14', mode: 'WORK_YEAR' } });
    expect(leaveYearLabel(work, day)).toEqual({ key: 'requests.ledger.yearWork', values: { from: '04-15', to: '04-14' } });
    expect(leaveYearLabel(readLeaveBalance({ remaining: 3 }), day)).toBeNull();
  });
  it('carried days are named with their last day while it is still ahead', () => {
    const b = readLeaveBalance(current);
    expect(carryNote(b, '2026-02-01')).toEqual({ count: 2, date: '2026-03-31' });
    expect(carryNote(b, '2026-03-31')).toEqual({ count: 2, date: '2026-03-31' });
    expect(carryNote(b, '2026-04-01')).toBeNull();
  });
  it('once the rule has run the EXPIRED line says it; no carried days, no note', () => {
    const expired = readLeaveBalance({ ...current, lines: [...mark.lines, { key: 'CARRY_EXPIRED', days: -1 }] });
    expect(carryNote(expired, '2026-02-01')).toBeNull();
    const none = readLeaveBalance({ ...current, lines: [{ key: 'ALLOWANCE', days: 25 }] });
    expect(carryNote(none, '2026-02-01')).toBeNull();
  });
});

describe('this request, inside a work year', () => {
  it('only the days inside the leave year are taken from it', () => {
    const b = { year: 2026, remaining: 14, pending: 0, leaveYear: { start: '2026-04-15', end: '2027-04-14' } };
    const cost = { counted: 3, byYear: { 2027: 3 }, days: [
      { day: '2027-04-13', cost: 1 }, { day: '2027-04-14', cost: 1 }, { day: '2027-04-15', cost: 1 },
    ] };
    expect(balancePreview(b, cost, 'VACATION')).toEqual({ before: 14, after: 12 });
  });
});
