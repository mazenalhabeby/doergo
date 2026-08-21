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

async function serviceWith(osrmUrl: string | undefined) {
  jest.resetModules();
  if (osrmUrl === undefined) delete process.env.OSRM_URL;
  else process.env.OSRM_URL = osrmUrl;
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
