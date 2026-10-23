/** A clock-out sends only a position taken at the tap — a stale one is dropped, never refused (sync/occurrence.ts). */
import { fixForTap } from '../occurrence';

const now = new Date('2026-10-23T18:00:00Z');
const fix = (secondsAgo: number) => ({
  lat: 1,
  lng: 2,
  accuracy: 5,
  fixAt: new Date(now.getTime() - secondsAgo * 1000).toISOString(),
});

describe('fixForTap', () => {
  it('keeps a fresh position', () => expect(fixForTap(fix(20), now)).toEqual(fix(20)));
  it('drops one the server would refuse as not taken at the tap', () =>
    expect(fixForTap(fix(10 * 60), now)).toBeNull());
  it('drops one too close to the limit to survive the trip', () => expect(fixForTap(fix(110), now)).toBeNull());
  it('drops nothing and garbage alike', () => {
    expect(fixForTap(null, now)).toBeNull();
    expect(fixForTap({ fixAt: 'not a time' }, now)).toBeNull();
  });
});
