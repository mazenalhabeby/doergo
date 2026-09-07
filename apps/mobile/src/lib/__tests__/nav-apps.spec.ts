import { navAppCandidates, isAlwaysAvailable, NAV_APP_PROBES, buildNavUrl } from '@hbcfield/shared/client';
import { hasArrived, remainingStops } from '../my-route';
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


describe('navigating to one stop rather than the whole day', () => {
  const start = { lat: 48.20, lng: 16.37 };
  const stops = [
    { lat: 48.21, lng: 16.38 },
    { lat: 48.19, lng: 16.35 },
    { lat: 48.25, lng: 16.40 },
  ];

  /*
    ⚠️ The regression this exists for. Google ignored `nextStop` and rebuilt the
    whole multi-stop trip, so the arrow beside the third stop reopened the
    entire route and started the driver at the first one. It only misbehaved
    with Google selected — the default on Android.
  */
  it('sends Google to the NAMED stop, not the whole route', () => {
    const url = buildNavUrl('google', { start, orderedStops: stops, nextStop: stops[2] });
    expect(url).toContain('destination=48.25%2C16.4');
    expect(url).not.toContain('waypoints');
  });

  it('still gives Google the whole trip when no stop is named', () => {
    const url = buildNavUrl('google', { start, orderedStops: stops });
    expect(url).toContain('waypoints');
  });

  it('sends Waze and Apple to the named stop too', () => {
    expect(buildNavUrl('waze', { start, orderedStops: stops, nextStop: stops[1] })).toContain('48.19');
    expect(buildNavUrl('apple', { start, orderedStops: stops, nextStop: stops[1] })).toContain('48.19');
  });
});

describe('resuming a route part-way through', () => {
  const ordered = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('reads arrival from the product record, not from a status name', () => {
    // routeEndedAt is stamped on En Route -> Arrived; status keys differ per
    // workflow and are editable per organization, so they cannot be the test.
    expect(hasArrived({ id: 'a', routeEndedAt: '2026-09-07T08:30:00Z' })).toBe(true);
    expect(hasArrived({ id: 'a', routeEndedAt: null })).toBe(false);
    expect(hasArrived({ id: 'a' })).toBe(false);
  });

  it('drops the stops already behind the driver', () => {
    expect(remainingStops(ordered, new Set(['a'])).map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('keeps the planned order instead of re-optimising on every open', () => {
    // A route that silently reshuffles itself is one nobody can follow or check.
    expect(remainingStops(ordered, new Set(['b'])).map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('returns nothing once every stop is done, so the screen can say so', () => {
    expect(remainingStops(ordered, new Set(['a', 'b', 'c']))).toEqual([]);
  });
});
