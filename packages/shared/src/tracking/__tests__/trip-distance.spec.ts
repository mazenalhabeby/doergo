import { tripDistanceOf } from '../trip-distance';

describe('tripDistanceOf — the metres of the CURRENT trip only', () => {
  const start = new Date('2026-10-21T08:00:00Z');

  it('counts the row of this trip', () => {
    expect(tripDistanceOf({ legStartedAt: start, distanceMeters: 1200 }, start)).toBe(1200);
    expect(tripDistanceOf({ legStartedAt: start.toISOString(), distanceMeters: 5 }, start)).toBe(5);
  });

  it('a new trip (En route again) starts at 0 though the old row is still there', () => {
    expect(tripDistanceOf({ legStartedAt: start, distanceMeters: 1200 }, new Date('2026-10-21T13:00:00Z'))).toBe(0);
  });

  it('no row is no distance; a job that never started matches a row with no start', () => {
    expect(tripDistanceOf(null, start)).toBe(0);
    expect(tripDistanceOf({ legStartedAt: null, distanceMeters: 7 }, null)).toBe(7);
  });
});
