import { navAppCandidates, isAlwaysAvailable, NAV_APP_PROBES } from '@hbcfield/shared/client';
import { navDecision, soleNavApp } from '../nav-apps';

/**
 * Which map app opens, and whether the person is asked at all.
 *
 * The interesting cases are the two ends: several apps must produce a choice,
 * and NO apps must still navigate. The second is the one that protects real
 * users — detection can return empty for reasons that have nothing to do with
 * what is installed.
 */
describe('choosing a navigation app', () => {
  const g = { key: 'google' as const, label: 'Google Maps' };
  const w = { key: 'waze' as const, label: 'Waze' };
  const a = { key: 'apple' as const, label: 'Apple Maps' };

  it('asks only when there is something to choose between', () => {
    expect(navDecision([g, w])).toBe('choose');
    expect(navDecision([a, g, w])).toBe('choose');
  });

  it('opens straight away with a single app — a question with one answer is a step', () => {
    expect(navDecision([g])).toBe('open');
    expect(soleNavApp([g])).toBe('google');
  });

  /*
    ⚠️ The case that keeps navigation working. An iOS build whose Info.plist
    predates LSApplicationQueriesSchemes sees every scheme as missing, and
    Android without the <queries> block does the same. Treating "detected
    nothing" as "you have no maps" would break navigation for everyone on that
    build; the universal link still opens whatever the system prefers.
  */
  it('navigates anyway when nothing was detected', () => {
    expect(navDecision([])).toBe('open');
    expect(soleNavApp([])).toBeTruthy();
  });

  it('never offers Apple Maps on Android', () => {
    expect(navAppCandidates('android')).not.toContain('apple');
    expect(navAppCandidates('ios')).toContain('apple');
  });

  it('never probes for Apple Maps — it cannot be removed from iOS', () => {
    expect(isAlwaysAvailable('apple', 'ios')).toBe(true);
    expect(isAlwaysAvailable('apple', 'android')).toBe(false);
    expect(NAV_APP_PROBES.apple).toBeNull();
  });

  /*
    The probes must be SCHEMES. Every build*Url returns an https link, and
    canOpenURL on https is always true because a browser can open it — probing
    with one would report every app as installed on every device.
  */
  it('probes with app schemes, never with the https links used to open them', () => {
    for (const [key, probe] of Object.entries(NAV_APP_PROBES)) {
      if (!probe) continue;
      expect(probe.startsWith('http')).toBe(false);
      expect(probe).toMatch(/^[a-z]+:\/\/$/);
      expect(key).toBeTruthy();
    }
  });
});
