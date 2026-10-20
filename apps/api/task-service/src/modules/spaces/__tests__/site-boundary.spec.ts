import { siteBoundaryChanged } from '../site-boundary';

/** BOUNDARY_CHANGED is about the site moving — never a rename or a time-zone change. */
const site = { lat: 47.98, lng: 13.82, geofenceRadius: 50, geofencePolygon: null as unknown };

describe('site boundary changed', () => {
  it('a rename (no position fields sent) is not a change', () => {
    expect(siteBoundaryChanged(site, {}, undefined)).toBe(false);
  });
  it('sending the same values is not a change', () => {
    expect(siteBoundaryChanged(site, { lat: 47.98, lng: 13.82, geofenceRadius: 50 }, undefined)).toBe(false);
  });
  it('moving the pin or the radius is', () => {
    expect(siteBoundaryChanged(site, { lat: 47.99 }, undefined)).toBe(true);
    expect(siteBoundaryChanged(site, { geofenceRadius: 80 }, undefined)).toBe(true);
  });
  it('drawing, changing or clearing the area is; re-sending the same area is not', () => {
    const area = [
      { lat: 1, lng: 1 },
      { lat: 1, lng: 2 },
      { lat: 2, lng: 2 },
    ];
    expect(siteBoundaryChanged(site, {}, area)).toBe(true);
    expect(siteBoundaryChanged({ ...site, geofencePolygon: area }, {}, area)).toBe(false);
    expect(siteBoundaryChanged({ ...site, geofencePolygon: area }, {}, { DbNull: true })).toBe(true);
  });
});
