import { readFileSync } from 'fs';
import { join } from 'path';
import { isAtSite, ATTENDANCE_CONSTANTS } from '@hbcfield/shared';

/**
 * How close counts as "at the job".
 *
 * Marking arrival used to run its own haversine against a private 20-metre
 * constant, and it was wrong twice over.
 *
 * Twenty metres is inside the error of an ordinary phone fix — 5 to 50 metres,
 * worse beside a building — so a technician standing at the customer's door was
 * regularly told they were thirty-five metres away. And the device REPORTS how
 * unsure it is, which the check discarded: "here, ±40m" was judged as though it
 * had said "here, exactly".
 *
 * Both are answered by `isAtSite`, which the workspace clock-in already uses.
 * These pin the behaviour that matters, then that the task check actually asks it.
 */

// Wr. Neudorf, roughly — the job site from the report that started this.
const SITE = { lat: 48.0836, lng: 16.3163 };
const RADIUS = ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS; // 50

const site = (geofenceRadius: number = RADIUS) => ({ ...SITE, geofenceRadius, geofencePolygon: null });

/** Roughly `metres` north of the site. */
const northOf = (metres: number) => ({ lat: SITE.lat + metres / 111_320, lng: SITE.lng });

describe('arriving at a job', () => {
  it('accepts somebody standing on the spot', () => {
    expect(isAtSite({ ...SITE, accuracy: 5 }, site()).inside).toBe(true);
  });

  /*
    The reported case. At the door, a fix that knows it is ±40m out: under the
    old rule this was "35 metres away, move closer" — advice the person could
    not act on, because they were already there.
  */
  it('accepts a door-step fix the device admits is fuzzy', () => {
    expect(isAtSite({ ...northOf(35), accuracy: 40 }, site()).inside).toBe(true);
  });

  it('still refuses somebody who is genuinely elsewhere', () => {
    const away = isAtSite({ ...northOf(400), accuracy: 10 }, site());
    expect(away.inside).toBe(false);
    expect(Math.round(away.distanceToCentre!)).toBeGreaterThan(350);
  });

  /*
    A confident fix is held to the radius. Accuracy widens the zone; it is not a
    way to pass by claiming to be unsure — and the DTO bounds it besides.
  */
  it('does not let a precise fix wander', () => {
    expect(isAtSite({ ...northOf(120), accuracy: 3 }, site()).inside).toBe(false);
  });

  it('honours a workspace that set its own radius', () => {
    expect(isAtSite({ ...northOf(150), accuracy: 0 }, site(80)).inside).toBe(false);
    expect(isAtSite({ ...northOf(150), accuracy: 0 }, site(200)).inside).toBe(true);
  });

  /*
    An app that does not send accuracy must behave exactly as it always did —
    no claim is not a claim of infinite tolerance.
  */
  it('treats a missing accuracy as no tolerance at all', () => {
    expect(isAtSite({ ...northOf(70) }, site()).inside).toBe(false);
    expect(isAtSite({ ...northOf(30) }, site()).inside).toBe(true);
  });

  it('is more generous than the 20 metres it replaced', () => {
    // The exact case that failed: 35m out, on a default-radius site.
    expect(35).toBeGreaterThan(20);
    expect(isAtSite({ ...northOf(35), accuracy: 0 }, site()).inside).toBe(true);
  });
});

describe('the task check asks the shared rule, not its own', () => {
  const SRC = readFileSync(join(__dirname, '..', 'tasks.service.ts'), 'utf8');

  it('calls isAtSite for arrival', () => {
    expect(SRC).toContain('isAtSite(');
  });

  it('has no private geofence constant left to disagree with it', () => {
    expect(SRC).not.toContain('GEOFENCE_RADIUS_METERS');
  });

  it('forwards the accuracy the device reported', () => {
    expect(SRC).toMatch(/accuracy:\s*data\.accuracy/);
  });

  it('falls back to the product-wide default, not a number of its own', () => {
    expect(SRC).toContain('ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS');
  });
});
