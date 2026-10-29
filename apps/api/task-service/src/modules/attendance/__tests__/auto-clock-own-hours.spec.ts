/**
 * The automatic clock reads the member's OWN hours at a workspace ("works here as" / own daily hours,
 * clock review D1) — not only the workspace's — so "Still working?", the leader notice and the presence
 * close fire at the person's own day.
 */
import { MEMBER_AUTO_CLOCK_SELECT, memberAutoClock } from '../auto-clock/auto-clock-helpers';

const space = { autoClock: { enabled: true }, noShiftDailyMinutes: 480, noShiftPolicy: 'ALLOW' };
const row = (own: { workAs?: string | null; workDailyMinutes?: number | null }, ws = space) => ({
  autoClock: true,
  autoClockMode: 'PRESENCE',
  autoClockStartWindow: null,
  space: ws,
  user: { autoClockConsentAt: new Date('2026-10-01'), isExternal: false },
  ...own,
});

describe('the automatic clock goes by the member’s own hours', () => {
  it('selects the assignment’s own columns', () => {
    expect(MEMBER_AUTO_CLOCK_SELECT).toMatchObject({ workAs: true, workDailyMinutes: true });
  });

  it('the workspace’s hours when the member has none of their own', () => {
    expect(memberAutoClock(row({}))!.noShiftMinutes).toBe(480);
  });

  it('their own daily hours win', () => {
    expect(memberAutoClock(row({ workDailyMinutes: 600 }))!.noShiftMinutes).toBe(600);
  });

  it('their own way of working decides the policy, not the workspace’s', () => {
    const limitWs = { ...space, noShiftPolicy: 'LIMIT' };
    expect(memberAutoClock(row({}, limitWs))!.noShiftLimit).toBe(true);
    // Works here as FLEXIBLE_HOURS: ALLOW, whatever the workspace says.
    expect(memberAutoClock(row({ workAs: 'FLEXIBLE_HOURS' }, limitWs))!.noShiftLimit).toBe(false);
  });
});
