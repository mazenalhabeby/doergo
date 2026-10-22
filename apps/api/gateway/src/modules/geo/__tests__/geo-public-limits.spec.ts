import { GeoSearchService } from '../geo-search.service';
import 'reflect-metadata';
import { GeoController } from '../geo.controller';

/**
 * The geocoding routes proxy the BILLED Google key and are still @Public
 * (their web and phone callers send no token yet — see geo.controller.ts).
 * Until that changes, none of them may fall back to the global 200/min: each
 * carries its own tight limit. A new public geo route without one fails here.
 */
describe('public geocoding routes are throttled', () => {
  const proto = GeoController.prototype as unknown as Record<string, unknown>;
  const PUBLIC = Object.getOwnPropertyNames(GeoController.prototype).filter(
    (k) => k !== 'constructor' && Reflect.getMetadata('isPublic', proto[k] as object) === true,
  );

  it('finds the three provider-backed routes', () => {
    expect(PUBLIC.sort()).toEqual(['place', 'reverse', 'search']);
  });

  it.each(['search', 'place', 'reverse'])('%s has its own per-minute limit, well under the global one', (name) => {
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', proto[name] as object);
    const ttl = Reflect.getMetadata('THROTTLER:TTLdefault', proto[name] as object);
    expect(ttl).toBe(60_000);
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(40);
  });

  it('never spends a provider call on an absurd query', async () => {
    const out = await new GeoController(new GeoSearchService()).search('x'.repeat(5000));
    expect(out.results).toEqual([]);
  });
});
