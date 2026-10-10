/**
 * A push's button acts only as the member it was for.
 */
import { mayActOnPush } from '../push-recipient';

describe('may a push button act now?', () => {
  it('a push naming its recipient: only for that member', () => {
    expect(mayActOnPush({ data: { recipientId: 'mike' }, deliveredAt: null, userId: 'mike', sessionStartedAt: null })).toBe(true);
    expect(mayActOnPush({ data: { recipientId: 'mike' }, deliveredAt: null, userId: 'karim', sessionStartedAt: null })).toBe(false);
  });

  it('⚠️ no recipient (today\'s server): a push delivered before this session began was not for it', () => {
    const start = Date.parse('2026-10-10T08:00:00Z');
    const before = start - 60_000;
    const during = start + 60_000;
    expect(mayActOnPush({ data: { eventId: 'e' }, deliveredAt: before, userId: 'karim', sessionStartedAt: start })).toBe(false);
    expect(mayActOnPush({ data: { eventId: 'e' }, deliveredAt: during, userId: 'karim', sessionStartedAt: start })).toBe(true);
    // expo reports seconds on some platforms.
    expect(mayActOnPush({ data: {}, deliveredAt: Math.floor(before / 1000), userId: 'karim', sessionStartedAt: start })).toBe(false);
  });

  it('nobody signed in: never', () => {
    expect(mayActOnPush({ data: {}, deliveredAt: Date.now(), userId: null, sessionStartedAt: 0 })).toBe(false);
  });
});

describe('the calendar buttons ask before acting', () => {
  const done = jest.fn(async () => undefined);
  jest.doMock('../api', () => ({ calendarApi: { done, snooze: jest.fn(), respond: jest.fn() } }));
  jest.doMock('../api/client', () => ({ sessionStartedAt: async () => 2_000_000_000_000 }));

  it('a reminder left in the tray by the last member is not ticked off as the next one', async () => {
    const { runCalendarAction } = require('../calendar-push-actions');
    const r = await runCalendarAction('cal_done', { eventId: 'e1' }, { userId: 'karim', deliveredAt: 1_999_999_000_000 });
    expect(r).toBe('not-yours');
    expect(done).not.toHaveBeenCalled();
    expect(await runCalendarAction('cal_done', { eventId: 'e1' }, { userId: 'karim', deliveredAt: 2_000_000_100_000 })).toBe('done');
    expect(done).toHaveBeenCalledTimes(1);
  });
});
