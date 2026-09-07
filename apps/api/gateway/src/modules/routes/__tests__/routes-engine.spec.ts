/**
 * The routing engine is opt-in.
 *
 * It used to default to `router.project-osrm.org`, a public demo host that is
 * not licensed for production and that would have received every customer
 * address on a rep's route. Unset now means "order the stops ourselves", which
 * is the same path the optimizer already took whenever OSRM was slow or down.
 *
 * OSRM_URL is read once at module load, so each case loads the module fresh.
 */
const START = { lat: 48.2, lng: 16.37, label: 'Depot' };
const STOPS = [
  { id: 'a', lat: 48.21, lng: 16.38, label: 'A' },
  { id: 'b', lat: 48.19, lng: 16.35, label: 'B' },
];

async function serviceWith(osrmUrl: string | undefined, googleKey?: string) {
  jest.resetModules();
  if (osrmUrl === undefined) delete process.env.OSRM_URL;
  else process.env.OSRM_URL = osrmUrl;
  if (googleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = googleKey;
  const { RoutesService } = await import('../routes.service');
  return new RoutesService();
}

describe('route optimization without a configured engine', () => {
  const originalUrl = process.env.OSRM_URL;
  const fetchSpy = jest.spyOn(global, 'fetch');

  afterEach(() => {
    fetchSpy.mockReset();
    if (originalUrl === undefined) delete process.env.OSRM_URL;
    else process.env.OSRM_URL = originalUrl;
  });
  afterAll(() => fetchSpy.mockRestore());

  it('orders the stops itself and calls nobody', async () => {
    const svc = await serviceWith(undefined);
    const route = await svc.optimize({ start: START, stops: STOPS } as never);

    expect(route.engine).toBe('nearest-neighbour');
    expect(route.order).toHaveLength(2);
    // The point of the change: no request leaves this process.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('says so even when there is nothing to route', async () => {
    const svc = await serviceWith(undefined);
    const route = await svc.optimize({ start: START, stops: [] } as never);
    expect(route.engine).toBe('nearest-neighbour');
  });

  it('uses the engine once one is configured', async () => {
    const svc = await serviceWith('https://osrm.internal');
    fetchSpy.mockResolvedValue({ ok: false, status: 503 } as Response);

    const route = await svc.optimize({ start: START, stops: STOPS } as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('https://osrm.internal/trip/v1/driving/');
    // …and still answers when that engine is unreachable.
    expect(route.engine).toBe('nearest-neighbour');
  });
});


/**
 * Google Routes: the engine that draws the road.
 *
 * Worth testing precisely because it cannot be exercised by running the app —
 * there is no key in development, so every local run silently takes the
 * nearest-neighbour path and proves nothing about this code. The parts that
 * would be wrong in production are the request Google is asked to answer and
 * the reordering of our own stops from its reply, and both are checkable here
 * against a stubbed response.
 */
describe('the Google Routes engine', () => {
  const START = { lat: 48.2, lng: 16.37, label: 'Depot' };
  const THREE = [
    { id: 'a', lat: 48.21, lng: 16.38, label: 'A' },
    { id: 'b', lat: 48.19, lng: 16.35, label: 'B' },
    { id: 'c', lat: 48.25, lng: 16.40, label: 'C' },
  ];
  // (38.5,-120.2) (40.7,-120.95) (43.252,-126.453) — Google's documented sample.
  const SAMPLE_POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

  const reply = (over: Record<string, unknown> = {}) => ({
    ok: true,
    json: async () => ({
      routes: [{
        // Google says: drive the intermediates in the order 1, 0.
        optimizedIntermediateWaypointIndex: [1, 0],
        polyline: { encodedPolyline: SAMPLE_POLYLINE },
        legs: [
          { distanceMeters: 1000, duration: '600s' },
          { distanceMeters: 2000, duration: '900s' },
          { distanceMeters: 3000, duration: '1200s' },
        ],
        distanceMeters: 6000,
        duration: '2700s',
        ...over,
      }],
    }),
  });

  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(reply());
    (global as any).fetch = fetchMock;
  });

  it('is preferred over OSRM when a key is present, and returns road geometry', async () => {
    const svc = await serviceWith('http://osrm.internal', 'key-123');
    const out = await svc.optimize({ start: START, stops: THREE } as any);

    expect(out.engine).toBe('google');
    expect(fetchMock.mock.calls[0][0]).toContain('routes.googleapis.com');
    // The line the map draws, in GeoJSON [lng, lat] order.
    const coords = (out.geometry as any).coordinates;
    expect(coords[0][0]).toBeCloseTo(-120.2, 4);
    expect(coords[0][1]).toBeCloseTo(38.5, 4);
  });

  it('asks Google to optimize, and pays for only the fields it draws', async () => {
    const svc = await serviceWith(undefined, 'key-123');
    await svc.optimize({ start: START, stops: THREE } as any);

    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.optimizeWaypointOrder).toBe(true);
    expect(body.travelMode).toBe('DRIVE');
    expect(init.headers['X-Goog-Api-Key']).toBe('key-123');
    // Billing follows the field mask, so it must not grow idly.
    expect(init.headers['X-Goog-FieldMask']).toContain('routes.polyline.encodedPolyline');
    expect(init.headers['X-Goog-FieldMask']).not.toContain('routes.legs.steps');
  });

  it('reorders OUR stops the way Google said to drive them', async () => {
    const svc = await serviceWith(undefined, 'key-123');
    const out = await svc.optimize({ start: START, stops: THREE } as any);

    /*
      With no explicit end, the last stop is the destination and the rest are
      intermediates — so ['a','b'] are optimized and 'c' is where the day ends.
      Google returned [1, 0], meaning b before a.

      This is the piece most likely to be silently wrong: the indices are into
      the intermediates WE sent, not into our original list, and getting that
      confused produces a route that is subtly out of order and still looks
      plausible on a map.
    */
    expect(out.order).toEqual(['b', 'a', 'c']);
  });

  it('keeps the order we sent when Google optimizes nothing', async () => {
    fetchMock.mockResolvedValue(reply({ optimizedIntermediateWaypointIndex: undefined }));
    const svc = await serviceWith(undefined, 'key-123');
    const out = await svc.optimize({ start: START, stops: THREE } as any);
    expect(out.order).toEqual(['a', 'b', 'c']);
  });

  it('reads Google durations, which are strings of seconds', async () => {
    const svc = await serviceWith(undefined, 'key-123');
    const out = await svc.optimize({ start: START, stops: THREE } as any);
    expect(out.totalSeconds).toBe(2700);
    expect(out.totalMeters).toBe(6000);
    expect(out.legs[0].seconds).toBe(600);
  });

  it('falls through to an order rather than failing when Google errors', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const svc = await serviceWith(undefined, 'key-123');
    const out = await svc.optimize({ start: START, stops: THREE } as any);
    // A rep pressing Optimize gets a plan, not an error screen — just one
    // without a drawn road.
    expect(out.engine).toBe('nearest-neighbour');
    expect(out.order).toHaveLength(3);
  });
});
