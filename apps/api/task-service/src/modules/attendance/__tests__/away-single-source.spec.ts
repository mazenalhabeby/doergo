import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * The ceiling and the grant are decided in ONE place.
 *
 * Three surfaces answer "may this person work away from here": the clock-in
 * that refuses, the workspace screen that explains the site's policy, and the
 * member screen that shows the effective answer per assignment. If any of them
 * reads the columns and reasons for itself, somebody is offered a choice the
 * server then refuses — which reads as the product being broken rather than as
 * a rule.
 */
describe('working away is decided once', () => {
  const SERVICE = join(__dirname, '..', 'attendance.service.ts');

  it('the clock-in asks the shared rule, and does not re-implement it', () => {
    const src = readFileSync(SERVICE, 'utf8');
    expect(src).toContain('resolveAwayAccess(');

    // The shape of the bug: comparing the policy column by hand instead.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/geofencePolicy\s*===\s*['"]/);
    expect(code).not.toMatch(/geofencePolicy\s*!==\s*['"]/);
  });

  it('nothing reads the retired global constant any more', () => {
    /*
      `REQUIRE_GEOFENCE_FOR_CLOCK_IN` was one switch for the entire product — a
      yard and a client-facing sales team had to want the same answer. It is
      replaced by a per-workspace ceiling, and a caller left behind would make
      one workspace's setting silently inert.
    */
    const roots = [join(__dirname, '..', '..', '..')];
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (n === 'node_modules' || n === 'dist' || n === '__tests__') return [];
        return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(n) ? [p] : [];
      });

    /*
      Comments stripped before scanning.

      Twice today a guard of mine matched the prose EXPLAINING the bug and
      reported the explanation as the bug. A test that fails on its own
      documentation teaches people to delete the documentation.
    */
    const offenders = roots.flatMap(walk).filter((f) => {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      return /REQUIRE_GEOFENCE_FOR_CLOCK_IN/.test(code);
    });

    expect(offenders).toEqual([]);
  });

  it('the ceiling is checked before the grant, so a strict site refuses everybody', () => {
    // Ordering is the whole separation: read the grant first and an
    // administrator would clock in away from a factory floor.
    const src = readFileSync(SERVICE, 'utf8');
    const call = src.slice(src.indexOf('resolveAwayAccess({'));
    const policyAt = call.indexOf('policy:');
    const grantAt = call.indexOf('userAllowRemote:');
    expect(policyAt).toBeGreaterThan(-1);
    expect(policyAt).toBeLessThan(grantAt);
  });
});
