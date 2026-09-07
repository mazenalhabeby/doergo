import {
  navAppCandidates, isAlwaysAvailable, NAV_APP_PROBES, buildNavUrl,
  stopsAheadOf, AT_STOP_RADIUS_METRES,
} from '@hbcfield/shared/client';
import { hasArrived } from '../my-route';
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
  // Three stops a few hundred metres apart in Vienna, in planned order.
  const A = { id: 'a', lat: 48.2000, lng: 16.3700 };
  const B = { id: 'b', lat: 48.2100, lng: 16.3800 };
  const C = { id: 'c', lat: 48.2200, lng: 16.3900 };
  const ordered = [A, B, C];
  const ids = (list: { id: string }[]) => list.map((s) => s.id);

  it('reads a recorded arrival from the product, not from a status name', () => {
    // routeEndedAt is stamped on En Route -> Arrived; status keys differ per
    // workflow and are editable per organization, so they cannot be the test.
    expect(hasArrived({ id: 'a', routeEndedAt: '2026-09-07T08:30:00Z' })).toBe(true);
    expect(hasArrived({ id: 'a', routeEndedAt: null })).toBe(false);
    expect(hasArrived({ id: 'a' })).toBe(false);
  });

  /*
    The behaviour actually asked for: standing at stop one, continue to two.
    A driver who simply drove there without touching their phone has no
    recorded arrival, and they are the likeliest person to press this button.
  */
  it('drops the stop you are standing at, and continues to the next', () => {
    expect(ids(stopsAheadOf(A, ordered))).toEqual(['b', 'c']);
    expect(ids(stopsAheadOf(B, ordered))).toEqual(['c']);
  });

  it('keeps the planned order — it never re-optimises', () => {
    // Standing at C, which is LAST in the plan: nothing is ahead. The order of
    // what remains is always the order that was agreed.
    expect(ids(stopsAheadOf(C, ordered))).toEqual([]);
    expect(ids(stopsAheadOf(A, ordered))).toEqual(['b', 'c']);
  });

  it('leaves the whole route when the driver is between stops', () => {
    const faraway = { lat: 48.30, lng: 16.60 };
    expect(ids(stopsAheadOf(faraway, ordered))).toEqual(['a', 'b', 'c']);
  });

  it('drops the stops before the one reached, not just that one', () => {
    // Arriving at three means one and two were done or deliberately skipped;
    // either way, sending somebody backwards is not "continue".
    expect(ids(stopsAheadOf(C, ordered))).toEqual([]);
    expect(ids(stopsAheadOf(B, ordered))).toEqual(['c']);
  });

  it('still honours a recorded arrival with no position at all', () => {
    expect(ids(stopsAheadOf(null, ordered, new Set(['a'])))).toEqual(['b', 'c']);
  });

  it('matches only the NEAREST stop, so neighbours cannot both count', () => {
    // Two stops within the radius of each other: standing at the first must
    // not skip the second.
    const near1 = { id: 'x', lat: 48.2000, lng: 16.3700 };
    const near2 = { id: 'y', lat: 48.2008, lng: 16.3700 }; // ~90m away
    expect(ids(stopsAheadOf(near1, [near1, near2]))).toEqual(['y']);
  });

  it('uses a radius wide enough for a car park and no wider', () => {
    // Too tight sends a driver to navigate to a building they are inside; too
    // loose skips a customer nobody misses until the end of the day.
    expect(AT_STOP_RADIUS_METRES).toBeGreaterThanOrEqual(100);
    expect(AT_STOP_RADIUS_METRES).toBeLessThanOrEqual(300);
  });
});
