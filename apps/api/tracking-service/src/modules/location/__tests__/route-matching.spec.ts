import { RouteMatchingService } from '../route-matching.service';

/**
 * The matcher talks to a network service, so what's worth pinning down is the
 * behaviour around that call: it must not run unless an operator configured a
 * destination, it must not send an unbounded number of coordinates, and it must
 * never take a route response down with it.
 */
describe('RouteMatchingService', () => {
  const point = (i: number) => ({
    lat: 47.98 + i * 0.0001,
    lng: 13.82 + i * 0.0001,
    timestamp: new Date(1_700_000_000_000 + i * 10_000),
  });

  let service: RouteMatchingService;
  const originalUrl = process.env.OSRM_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new RouteMatchingService();
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.OSRM_URL;
    else process.env.OSRM_URL = originalUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends nothing anywhere when no endpoint is configured', async () => {
    delete process.env.OSRM_URL;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    await expect(service.matchToRoads([point(0), point(1)])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call out for a trace too short to match', async () => {
    process.env.OSRM_URL = 'http://osrm.internal:5000';
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    await expect(service.matchToRoads([point(0)])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caps how many coordinates go upstream, and keeps the final one', async () => {
    process.env.OSRM_URL = 'http://osrm.internal:5000/';
    let requested = '';
    global.fetch = jest.fn(async (url: string) => {
      requested = url;
      return {
        ok: true,
        json: async () => ({ code: 'Ok', matchings: [{ geometry: { coordinates: [[13.82, 47.98]] } }] }),
      };
    }) as never;

    const points = Array.from({ length: 640 }, (_, i) => point(i));
    await service.matchToRoads(points);

    const coords = requested.split('/match/v1/driving/')[1].split('?')[0].split(';');
    expect(coords.length).toBeLessThanOrEqual(100);
    const last = points[points.length - 1];
    expect(coords[coords.length - 1]).toBe(`${last.lng},${last.lat}`);
    // One timestamp per coordinate, or OSRM rejects the request.
    expect(requested.match(/timestamps=([^&]*)/)![1].split(';').length).toBe(coords.length);
    // The configured base is used verbatim, with no doubled slash.
    expect(requested.startsWith('http://osrm.internal:5000/match/v1/')).toBe(true);
  });

  it('returns [lat, lng] pairs, flipping OSRM’s [lng, lat] order', async () => {
    process.env.OSRM_URL = 'http://osrm.internal:5000';
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [{ geometry: { coordinates: [[13.82, 47.98], [13.83, 47.99]] } }],
      }),
    })) as never;

    await expect(service.matchToRoads([point(0), point(1)])).resolves.toEqual([
      [47.98, 13.82],
      [47.99, 13.83],
    ]);
  });

  it.each([
    ['an upstream error status', async () => ({ ok: false, json: async () => ({}) })],
    ['a refusal to match', async () => ({ ok: true, json: async () => ({ code: 'NoMatch' }) })],
    ['a thrown request', async () => { throw new Error('ECONNREFUSED'); }],
  ])('degrades to raw points on %s', async (_label, impl) => {
    process.env.OSRM_URL = 'http://osrm.internal:5000';
    global.fetch = jest.fn(impl) as never;

    await expect(service.matchToRoads([point(0), point(1)])).resolves.toBeNull();
  });
});
