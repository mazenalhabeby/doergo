/**
 * getFix — the one way to take a one-shot position.
 *
 * The rule that matters most: it ALWAYS SETTLES. A spinner waiting on a GPS
 * that never answers is the bug this file exists to end.
 */
const location = {
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
};
jest.mock('expo-location', () => location);

import { FIX_POLICIES, FixError, fixFailure, getFix } from '../location-fix';

const fix = (lat: number, timestamp = 1_000) => ({ coords: { latitude: lat, longitude: 13, accuracy: 5 }, timestamp });
const never = () => new Promise(() => undefined);

beforeEach(() => {
  jest.resetAllMocks();
  location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
  location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
  location.getLastKnownPositionAsync.mockResolvedValue(null);
  location.getCurrentPositionAsync.mockResolvedValue(fix(47));
});
afterEach(() => jest.useRealTimers());

describe('always settles within its deadline', () => {
  it.each(Object.keys(FIX_POLICIES).filter((p) => p !== 'cached'))('%s: a GPS that never answers rejects with timeout', async (purpose) => {
    jest.useFakeTimers();
    location.getCurrentPositionAsync.mockImplementation(never);
    const settled = getFix({ purpose: purpose as never }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(FIX_POLICIES[purpose as keyof typeof FIX_POLICIES].timeoutMs + 1);
    const err = await settled;
    expect(err).toBeInstanceOf(FixError);
    expect(fixFailure(err)).toBe('timeout');
  });

  it('a hanging cache lookup is inside the same deadline', async () => {
    jest.useFakeTimers();
    location.getLastKnownPositionAsync.mockImplementation(never);
    const settled = getFix({ purpose: 'cached' }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(FIX_POLICIES.cached.timeoutMs + 1);
    expect(fixFailure(await settled)).toBe('timeout');
  });

  it('every policy has a finite deadline', () => {
    for (const p of Object.values(FIX_POLICIES)) expect(Number.isFinite(p.timeoutMs) && p.timeoutMs > 0).toBe(true);
  });

  it('timeout with orLastKnown settles for the last position the OS knows', async () => {
    jest.useFakeTimers();
    location.getCurrentPositionAsync.mockImplementation(never);
    location.getLastKnownPositionAsync.mockResolvedValue(fix(46, 5));
    const settled = getFix({ purpose: 'evidence', orLastKnown: true });
    await jest.advanceTimersByTimeAsync(FIX_POLICIES.evidence.timeoutMs + 1);
    const got = await settled;
    expect(got.coords.latitude).toBe(46);
    expect(got.timestamp).toBe(5); // its OWN time travels with it
  });

  it('an error from the GPS rejects as unavailable', async () => {
    location.getCurrentPositionAsync.mockRejectedValue(new Error('Location services are disabled'));
    expect(fixFailure(await getFix({ purpose: 'tap' }).catch((e) => e))).toBe('unavailable');
  });
});

describe('permission', () => {
  it('never prompts unless asked', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false, status: 'undetermined' });
    expect(fixFailure(await getFix({ purpose: 'nearby' }).catch((e) => e))).toBe('denied');
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('prompts when asked, and uses the answer', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false, status: 'undetermined' });
    expect((await getFix({ purpose: 'pick', ask: true })).coords.latitude).toBe(47);
    expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('a refusal is not rescued by the last known position', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    location.getLastKnownPositionAsync.mockResolvedValue(fix(46));
    expect(fixFailure(await getFix({ purpose: 'evidence', ask: true, orLastKnown: true }).catch((e) => e))).toBe('denied');
  });

  it('already granted: no prompt', async () => {
    await getFix({ purpose: 'evidence', ask: true });
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('purpose policies', () => {
  it('evidence is accurate and always fresh — a cached fix is not evidence of this tap', async () => {
    location.getLastKnownPositionAsync.mockResolvedValue(fix(46));
    expect((await getFix({ purpose: 'evidence' })).coords.latitude).toBe(47);
    expect(location.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: location.Accuracy.High });
  });

  it('nearby takes a recent cached fix (≤ 5 min) without spinning the GPS up', async () => {
    location.getLastKnownPositionAsync.mockResolvedValue(fix(46));
    expect((await getFix({ purpose: 'nearby' })).coords.latitude).toBe(46);
    expect(location.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 5 * 60_000 });
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('nearby with no recent cache takes a balanced fresh fix', async () => {
    await getFix({ purpose: 'nearby' });
    expect(location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: location.Accuracy.Balanced });
  });

  it('cached never switches the radio on', async () => {
    expect(fixFailure(await getFix({ purpose: 'cached' }).catch((e) => e))).toBe('unavailable');
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
    location.getLastKnownPositionAsync.mockResolvedValue(fix(46));
    expect((await getFix({ purpose: 'cached' })).coords.latitude).toBe(46);
    expect(location.getLastKnownPositionAsync).toHaveBeenLastCalledWith(undefined); // any age
  });

  it('a button answers fast: tap is the shortest deadline', () => {
    const others = Object.entries(FIX_POLICIES).filter(([k]) => k !== 'tap' && k !== 'cached');
    for (const [, p] of others) expect(FIX_POLICIES.tap.timeoutMs).toBeLessThanOrEqual(p.timeoutMs);
  });
});
