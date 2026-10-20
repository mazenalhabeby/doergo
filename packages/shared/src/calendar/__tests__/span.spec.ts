import { durationText, localInstant, moveEndWithStart, spanMinutes, spanProblem } from '@hbcfield/shared';

/** The New form's start → end rule (shared calendar/span.ts): the duration follows, it is never picked. */
describe('event span', () => {
  const t = (k: string, o: { n: number }) => ({ 'calendar.durDays': `${o.n} d`, 'calendar.durHours': `${o.n} h`, 'calendar.durMinutes': `${o.n} min` } as Record<string, string>)[k];

  it('a 20-hour flight over midnight is fine', () => {
    const s = localInstant('2026-10-16', '22:00'), e = localInstant('2026-10-17', '18:00');
    expect(spanMinutes(s, e)).toBe(20 * 60);
    expect(spanProblem(s, e)).toBeNull();
    expect(durationText(spanMinutes(s, e), t)).toBe('20 h');
  });

  it('refuses an end before (or at) the start, and more than 14 days', () => {
    expect(spanProblem(localInstant('2026-10-16', '10:00'), localInstant('2026-10-16', '09:00'))).toBe('END_BEFORE_START');
    expect(spanProblem(localInstant('2026-10-16', '10:00'), localInstant('2026-10-16', '10:00'))).toBe('END_BEFORE_START');
    expect(spanProblem(localInstant('2026-10-01', '10:00'), localInstant('2026-10-15', '10:01'))).toBe('TOO_LONG');
  });

  it('moving the start keeps the duration', () => {
    const s = localInstant('2026-10-16', '22:00'), e = localInstant('2026-10-17', '18:00');
    const end = moveEndWithStart(s, e, localInstant('2026-10-18', '06:00'));
    expect(spanMinutes(localInstant('2026-10-18', '06:00'), end)).toBe(20 * 60);
  });

  it('reads days, hours and minutes', () => {
    expect(durationText(26 * 60 + 30, t)).toBe('1 d 2 h 30 min');
    expect(durationText(45, t)).toBe('45 min');
    expect(durationText(0, t)).toBe('0 min');
  });
});
