import {
  isAtSite, isPointInPolygon, distanceToPolygonEdge, polygonAreaSqm,
  validateGeofencePolygon, parseGeofencePolygon, siteEnforcesZone,
  GEOFENCE_POLYGON_LIMITS, ATTENDANCE_CONSTANTS,
  RADIUS_SLIDER_STEPS, radiusToSliderPosition, sliderPositionToRadius,
} from '@hbcfield/shared/client';

/**
 * The geometry that decides whether somebody can start their shift.
 *
 * A wrong answer here is not a rendering glitch: it either refuses a person
 * standing at their workplace, or accepts one sitting at home. Both are worth
 * a test that fails loudly.
 *
 * Coordinates are around a real place (Laakirchen) so the numbers are in the
 * range the code actually runs at — a flat-earth projection that works at the
 * equator and drifts at 48° north would pass a test written around (0,0).
 */

// ~200m x 200m square. 0.0009° lat ≈ 100m; lng is scaled by cos(48°) ≈ 0.669.
const S = 47.98;
const W = 13.82;
const dLat = 0.0009;
const dLng = 0.0009 / Math.cos((S * Math.PI) / 180);

const SQUARE = [
  { lat: S - dLat, lng: W - dLng },
  { lat: S - dLat, lng: W + dLng },
  { lat: S + dLat, lng: W + dLng },
  { lat: S + dLat, lng: W - dLng },
];

const CENTRE = { lat: S, lng: W };

describe('point in polygon', () => {
  it('accepts the centre and rejects a point well outside', () => {
    expect(isPointInPolygon(CENTRE, SQUARE)).toBe(true);
    expect(isPointInPolygon({ lat: S + dLat * 3, lng: W }, SQUARE)).toBe(false);
  });

  it('is not fooled by a ray passing exactly through a vertex', () => {
    // A point due west of the top-left corner: a naive ray-cast counts that
    // vertex twice and flips the answer to "inside".
    const corner = SQUARE[3]!;
    expect(isPointInPolygon({ lat: corner.lat, lng: W - dLng * 4 }, SQUARE)).toBe(false);
  });

  it('handles a concave shape — the L that a circle cannot describe', () => {
    const L = [
      { lat: S - dLat, lng: W - dLng },
      { lat: S - dLat, lng: W + dLng },
      { lat: S, lng: W + dLng },
      { lat: S, lng: W },
      { lat: S + dLat, lng: W },
      { lat: S + dLat, lng: W - dLng },
    ];
    // Inside the arm that was cut away — a circle round the centre would say yes.
    expect(isPointInPolygon({ lat: S + dLat * 0.6, lng: W + dLng * 0.6 }, L)).toBe(false);
    expect(isPointInPolygon({ lat: S - dLat * 0.5, lng: W + dLng * 0.5 }, L)).toBe(true);
  });

  it('refuses a ring with fewer than three points instead of guessing', () => {
    expect(isPointInPolygon(CENTRE, [CENTRE, CENTRE])).toBe(false);
  });
});

describe('distance to the boundary', () => {
  it('measures to the nearest edge, not to a corner', () => {
    // Due north of the top edge by ~100m.
    const d = distanceToPolygonEdge({ lat: S + dLat * 2, lng: W }, SQUARE);
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(120);
  });

  it('is near zero on the edge itself', () => {
    expect(distanceToPolygonEdge({ lat: S + dLat, lng: W }, SQUARE)).toBeLessThan(1);
  });
});

describe('isAtSite — the one question', () => {
  const zone = { lat: S, lng: W, geofenceRadius: 50, geofencePolygon: SQUARE };

  it('uses the boundary when one is drawn, ignoring the radius', () => {
    // ~150m from the pin: outside the 50m circle, inside the drawn square.
    const far = { lat: S + dLat * 0.9, lng: W + dLng * 0.9 };
    expect(isAtSite(far, zone).inside).toBe(true);
    expect(isAtSite(far, { ...zone, geofencePolygon: null }).inside).toBe(false);
  });

  it('reports metres past the boundary, not past the centre', () => {
    const out = isAtSite({ lat: S + dLat * 2, lng: W }, zone);
    expect(out.inside).toBe(false);
    expect(out.metresOutside).toBeGreaterThan(70);
    expect(out.metresOutside).toBeLessThan(130);
    // The distance to the pin is larger — reporting that as "how far outside"
    // would tell somebody standing just past the fence that they are 200m away.
    expect(out.distanceToCentre!).toBeGreaterThan(out.metresOutside);
  });

  it('widens the zone by the reported GPS accuracy, both shapes', () => {
    const justOutside = { lat: S + dLat * 1.3, lng: W };
    expect(isAtSite(justOutside, zone).inside).toBe(false);
    expect(isAtSite({ ...justOutside, accuracy: 100 }, zone).inside).toBe(true);

    const circle = { lat: S, lng: W, geofenceRadius: 50, geofencePolygon: null };
    const nearby = { lat: S + dLat * 0.7, lng: W };
    expect(isAtSite(nearby, circle).inside).toBe(false);
    expect(isAtSite({ ...nearby, accuracy: 100 }, circle).inside).toBe(true);
  });

  it('enforces nothing when the site has no coordinates', () => {
    const logical = { lat: null, lng: null, geofenceRadius: 50, geofencePolygon: null };
    const r = isAtSite({ lat: S, lng: W }, logical);
    expect(r.evaluable).toBe(false);
    expect(r.inside).toBe(true);
    expect(siteEnforcesZone(logical)).toBe(false);
  });

  it('a negative accuracy cannot shrink the zone', () => {
    // Defensive: accuracy arrives from a client and is not trusted to be sane.
    const inside = { lat: S, lng: W, accuracy: -5000 };
    expect(isAtSite(inside, zone).inside).toBe(true);
  });
});

describe('validation of a drawn boundary', () => {
  it('accepts a plain ring', () => {
    const r = validateGeofencePolygon(SQUARE);
    expect(r.ok).toBe(true);
  });

  it('drops the repeated closing point rather than counting it', () => {
    const r = validateGeofencePolygon([...SQUARE, SQUARE[0]]);
    expect(r.ok && r.ring.length).toBe(4);
  });

  it('refuses fewer than three points', () => {
    const r = validateGeofencePolygon([SQUARE[0], SQUARE[1]]);
    expect(r.ok === false && r.error).toBe('TOO_FEW_POINTS');
  });

  it('refuses more points than the cap', () => {
    const many = Array.from({ length: GEOFENCE_POLYGON_LIMITS.MAX_POINTS + 1 }, (_, i) => ({
      lat: S + i * 0.00001, lng: W + i * 0.00001,
    }));
    const r = validateGeofencePolygon(many);
    expect(r.ok === false && r.error).toBe('TOO_MANY_POINTS');
  });

  it('refuses coordinates that are not coordinates', () => {
    for (const bad of [
      [{ lat: 'x', lng: W }, SQUARE[1], SQUARE[2]],
      [{ lat: 91, lng: W }, SQUARE[1], SQUARE[2]],
      [{ lat: NaN, lng: W }, SQUARE[1], SQUARE[2]],
      [{ lat: S }, SQUARE[1], SQUARE[2]],
      'not an array',
    ]) {
      const r = validateGeofencePolygon(bad);
      expect(r.ok).toBe(false);
    }
  });

  it('refuses a boundary drawn around a district', () => {
    // ~10km square — the control would look configured while accepting anyone.
    const huge = [
      { lat: S - 0.045, lng: W - 0.067 },
      { lat: S - 0.045, lng: W + 0.067 },
      { lat: S + 0.045, lng: W + 0.067 },
      { lat: S + 0.045, lng: W - 0.067 },
    ];
    expect(polygonAreaSqm(huge)).toBeGreaterThan(GEOFENCE_POLYGON_LIMITS.MAX_AREA_SQM);
    const r = validateGeofencePolygon(huge);
    expect(r.ok === false && r.error).toBe('AREA_TOO_LARGE');
  });
});

describe('reading the column back', () => {
  it('falls back to the radius rather than locking a site out', () => {
    // Anything unusable must mean "use the circle", never "nobody may clock in".
    for (const junk of [null, undefined, 'x', 42, [], [{ lat: 1 }], [{ lat: 'a', lng: 'b' }]]) {
      expect(parseGeofencePolygon(junk)).toBeNull();
    }
    expect(parseGeofencePolygon(SQUARE)).toHaveLength(4);
  });
});

describe('the radius cap', () => {
  it('is large enough to express a campus', () => {
    // Raised from 100m: a circle is measured from the geocoded front door, so
    // 100m could not cover a site with a yard at all.
    expect(ATTENDANCE_CONSTANTS.MAX_GEOFENCE_RADIUS).toBeGreaterThanOrEqual(500);
    expect(ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS).toBe(50);
  });
});

describe('the radius slider scale', () => {
  /*
    This exists because of a regression that changed nothing and looked like it
    changed everything. Raising the cap 100m -> 500m left a 50m radius sitting
    at 8% of the track instead of 44%; the number was identical, the handle had
    moved most of the way across, and it read as "clicking Draw changed my
    radius". A linear scale over a 50x range cannot serve both a 20m doorway and
    a 500m campus, so the scale is logarithmic — and a scale is arithmetic, so
    it gets asserted rather than eyeballed.
  */

  it('spends half the track on the sizes real sites use', () => {
    // Nearly every site is 10-100m. If a future change to the limits pushes
    // that range into a corner again, this is what says so.
    expect(radiusToSliderPosition(75)).toBeGreaterThanOrEqual(45);
    expect(radiusToSliderPosition(100)).toBeGreaterThanOrEqual(55);
  });

  it('anchors both ends exactly', () => {
    expect(sliderPositionToRadius(0)).toBe(ATTENDANCE_CONSTANTS.MIN_GEOFENCE_RADIUS);
    expect(sliderPositionToRadius(RADIUS_SLIDER_STEPS)).toBe(ATTENDANCE_CONSTANTS.MAX_GEOFENCE_RADIUS);
    expect(radiusToSliderPosition(ATTENDANCE_CONSTANTS.MIN_GEOFENCE_RADIUS)).toBe(0);
    expect(radiusToSliderPosition(ATTENDANCE_CONSTANTS.MAX_GEOFENCE_RADIUS)).toBe(RADIUS_SLIDER_STEPS);
  });

  it('never moves backwards as the handle moves forwards', () => {
    // A non-monotonic slider is unusable in a way that is hard to describe and
    // easy to introduce by mis-snapping.
    let previous = 0;
    for (let pos = 0; pos <= RADIUS_SLIDER_STEPS; pos++) {
      const metres = sliderPositionToRadius(pos);
      expect(metres).toBeGreaterThanOrEqual(previous);
      previous = metres;
    }
  });

  it('is stable: a value the slider produced survives re-rendering', () => {
    // NOT a round-trip test. Snapping is lossy on purpose — the handle can only
    // rest on positions the ladder allows — so position -> metres -> position
    // legitimately drifts. What must never drift is the metres: the control is
    // controlled, so every render maps the value back to a position and that
    // position back to a value. If that is not a fixpoint the handle creeps on
    // its own, one step per render, without anybody touching it.
    for (let pos = 0; pos <= RADIUS_SLIDER_STEPS; pos++) {
      const metres = sliderPositionToRadius(pos);
      expect(sliderPositionToRadius(radiusToSliderPosition(metres))).toBe(metres);
    }
  });

  it('only offers radii a person would choose', () => {
    for (let pos = 0; pos <= RADIUS_SLIDER_STEPS; pos++) {
      const metres = sliderPositionToRadius(pos);
      expect(metres % 5).toBe(0);
      if (metres >= 100) expect(metres % 25).toBe(0);
    }
  });

  it('stays inside the limits whatever it is handed', () => {
    for (const junk of [NaN, Infinity, -Infinity, -50, 0, 99999]) {
      const pos = radiusToSliderPosition(junk);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(RADIUS_SLIDER_STEPS);
    }
    for (const junk of [NaN, -10, 9999]) {
      const metres = sliderPositionToRadius(junk);
      expect(metres).toBeGreaterThanOrEqual(ATTENDANCE_CONSTANTS.MIN_GEOFENCE_RADIUS);
      expect(metres).toBeLessThanOrEqual(ATTENDANCE_CONSTANTS.MAX_GEOFENCE_RADIUS);
    }
  });
});
