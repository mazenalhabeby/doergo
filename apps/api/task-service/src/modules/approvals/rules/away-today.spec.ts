import { leaveDay } from './away-today';

/*
  "On leave today" is the ORGANIZATION's day, as the stand-ins are read — UTC's own day put HBC USA's evening on
  tomorrow (someone whose leave ends today read as back after 19:00 in New York).
*/
describe('leaveDay', () => {
  it('an evening in New York is still that day there', () => {
    const evening = new Date('2026-10-27T23:30:00.000Z'); // 19:30 in New York, already the 28th in UTC
    expect(leaveDay(evening, 'America/New_York').toISOString().slice(0, 10)).toBe('2026-10-27');
    expect(leaveDay(evening, 'Europe/Vienna').toISOString().slice(0, 10)).toBe('2026-10-28');
  });
});
