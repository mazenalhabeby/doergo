import { clockInPlace } from '../clock-in-place';

const site = { lat: 47.9813, lng: 13.8269, geofenceRadius: 50, geofencePolygon: null };

describe('clockInPlace — where a clock-in was, not whether it was admitted', () => {
  it('an away day is away', () => {
    expect(clockInPlace({ isRemote: true, clockInWithinGeofence: true, location: site })).toBe('AWAY');
  });

  it('flagged outside a ring that was on is outside', () => {
    expect(clockInPlace({ clockInWithinGeofence: false, clockInLat: 48.2, clockInLng: 16.37, location: site })).toBe(
      'OUTSIDE',
    );
  });

  it('at the site is on the site', () => {
    expect(
      clockInPlace({ clockInWithinGeofence: true, clockInLat: 47.9813, clockInLng: 13.8269, location: site }),
    ).toBe('ON_SITE');
  });

  it('admitted 300 km away with the ring off ("in the field") is away, never "on the site"', () => {
    expect(
      clockInPlace({ clockInWithinGeofence: true, clockInLat: 48.2082, clockInLng: 16.3738, location: site }),
    ).toBe('AWAY');
  });

  it('the GPS error widens the site, as at the clock-in', () => {
    // ~80 m north of the pin: outside 50 m, inside with a 40 m fix.
    const north = { clockInWithinGeofence: true, clockInLat: 47.98202, clockInLng: 13.8269, location: site };
    expect(clockInPlace(north)).toBe('AWAY');
    expect(clockInPlace({ ...north, clockInAccuracy: 40 })).toBe('ON_SITE');
  });

  it('nothing to judge against — no pin, no position — reads as the old flag did', () => {
    const noPin = { lat: null, lng: null, geofenceRadius: 50 };
    expect(clockInPlace({ clockInWithinGeofence: true, clockInLat: 48.2, clockInLng: 16.37, location: noPin })).toBe(
      'ON_SITE',
    );
    expect(clockInPlace({ clockInWithinGeofence: true, clockInLat: 0, clockInLng: 0, location: site })).toBe('ON_SITE');
    expect(clockInPlace({ clockInWithinGeofence: true, location: null })).toBe('ON_SITE');
  });
});
