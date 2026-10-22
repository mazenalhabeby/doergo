import { detectRequest } from '@hbcfield/shared/client';

/*
  What a member types into "Other", read into a request the form can show —
  never sent by itself. Tuesday 13 October 2026, the member's own clock.
*/
const NOW = new Date(2026, 9, 13, 9, 30);
const d = (text: string) => detectRequest(text, NOW);

describe('detectRequest — the mockup sentences', () => {
  it('leave for a family wedding, Thursday and Friday', () => {
    expect(d("Need 2 days off next Thursday and Friday for my daughter's wedding")).toMatchObject({
      kind: 'LEAVE', leaveType: 'FAMILY', startDate: '2026-10-22', endDate: '2026-10-23',
    });
  });
  it('more time tonight is extra time on the shift, today', () => {
    expect(d('can I stay 2 more hours tonight')).toMatchObject({ kind: 'EXTRA_TIME', startDate: '2026-10-13', minutes: 120 });
  });
  it('a fuel slip is an expense with its amount', () => {
    expect(d('fuel 84 euro for the van')).toMatchObject({ kind: 'EXPENSE', amountCents: 8400 });
  });
  it('working from home tomorrow is a remote day', () => {
    expect(d('working from home tomorrow')).toMatchObject({ kind: 'REMOTE', startDate: '2026-10-14' });
  });
  it('words for something else are left alone', () => {
    expect(d('new boots size 43')).toBeNull();
    expect(d('ok')).toBeNull();
  });
});

describe('detectRequest — five languages', () => {
  it.each([
    ['Ich brauche morgen frei, mein Kind ist krank', { kind: 'LEAVE', leaveType: 'SICK', startDate: '2026-10-14' }],
    ['Urlaub vom 20.10 bis 24.10', { kind: 'LEAVE', leaveType: 'VACATION', startDate: '2026-10-20', endDate: '2026-10-24' }],
    ['Homeoffice am Freitag', { kind: 'REMOTE', startDate: '2026-10-16' }],
    ['kann ich heute 90 Minuten länger bleiben', { kind: 'EXTRA_TIME', minutes: 90 }],
    ['Necesito vacaciones el lunes y martes que viene', { kind: 'LEAVE', leaveType: 'VACATION', startDate: '2026-10-19', endDate: '2026-10-20' }],
    ['teletrabajo mañana', { kind: 'REMOTE', startDate: '2026-10-14' }],
    ['gasolina 45,50 €', { kind: 'EXPENSE', amountCents: 4550 }],
    ['Je suis malade aujourd’hui', { kind: 'LEAVE', leaveType: 'SICK', startDate: '2026-10-13' }],
    ['télétravail jeudi', { kind: 'REMOTE', startDate: '2026-10-15' }],
    ['ferie dal 3 novembre per 5 giorni', { kind: 'LEAVE', leaveType: 'VACATION', startDate: '2026-11-03', endDate: '2026-11-07' }],
    ['straordinari 2 ore domani', { kind: 'OVERTIME', startDate: '2026-10-14', minutes: 120 }],
  ])('%s', (text, expected) => {
    expect(d(text)).toMatchObject(expected);
  });
});

describe('detectRequest — hours and dates', () => {
  it('starting later on a day is changed hours with the start time', () => {
    expect(d('start later on Monday, at 10 — doctor')).toMatchObject({ kind: 'HOURS', startDate: '2026-10-19', startTime: '10:00' });
  });
  it('leaving early reads the time as the end', () => {
    expect(d('leave early tomorrow at 15:30')).toMatchObject({ kind: 'HOURS', startDate: '2026-10-14', endTime: '15:30' });
  });
  it('overtime on another day is agreed in advance, not extra time', () => {
    expect(d('overtime on Saturday, 3 hours')).toMatchObject({ kind: 'OVERTIME', startDate: '2026-10-17', minutes: 180 });
  });
  it('a date already past this year is next year\'s', () => {
    expect(d('vacation 05.01')).toMatchObject({ startDate: '2027-01-05' });
  });
  it('"today" on the weekday it names is today; "next" is the week after', () => {
    expect(d('day off tuesday')?.startDate).toBe('2026-10-13');
    expect(d('day off next tuesday')?.startDate).toBe('2026-10-20');
  });
  it('says which words decided it', () => {
    expect(d('fuel 84 euro')!.because).toContain('fuel');
  });
});
