import { GeoController } from '../geo.controller';

/**
 * Which geocoder answers, and what happens when one is missing.
 *
 * Reverse used to be Photon-only, so deleting the Photon container would have
 * taken map-click auto-fill and the clock-in city label with it — silently,
 * since both fail by simply not filling anything in. Either provider is now
 * enough on its own, which is what makes Photon removable.
 *
 * Both are read at module load, so each case re-imports the controller.
 */
const LAT = '48.2';
const LON = '16.37';

async function controllerWith(env: { google?: string; photon?: string }) {
  jest.resetModules();
  if (env.google) process.env.GOOGLE_PLACES_API_KEY = env.google;
  else delete process.env.GOOGLE_PLACES_API_KEY;
  if (env.photon) process.env.PHOTON_URL = env.photon;
  else delete process.env.PHOTON_URL;
  const { GeoController: C } = await import('../geo.controller');
  return new C() as GeoController;
}

const googleReverseOk = {
  ok: true,
  json: async () => ({
    results: [
      {
        formatted_address: 'Stephansplatz 1, 1010 Wien, Austria',
        geometry: { location: { lat: 48.2, lng: 16.37 } },
        address_components: [
          { long_name: 'Wien', types: ['locality'] },
          { long_name: 'Austria', types: ['country'] },
        ],
      },
    ],
  }),
} as unknown as Response;

describe('reverse geocoding providers', () => {
  const saved = { g: process.env.GOOGLE_PLACES_API_KEY, p: process.env.PHOTON_URL };
  const fetchSpy = jest.spyOn(global, 'fetch');

  afterEach(() => fetchSpy.mockReset());
  afterAll(() => {
    fetchSpy.mockRestore();
    if (saved.g === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = saved.g;
    if (saved.p === undefined) delete process.env.PHOTON_URL;
    else process.env.PHOTON_URL = saved.p;
  });

  it('answers from Google with no Photon anywhere — the point of the change', async () => {
    const geo = await controllerWith({ google: 'key_1' });
    fetchSpy.mockResolvedValue(googleReverseOk);

    const { result } = await geo.reverse(LAT, LON);

    expect(result?.city).toBe('Wien');
    expect(result?.country).toBe('Austria');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('maps.googleapis.com');
  });

  it('never touches Photon when none is configured, even if Google fails', async () => {
    const geo = await controllerWith({ google: 'key_1' });
    fetchSpy.mockResolvedValue({ ok: false, status: 500 } as Response);

    const { result } = await geo.reverse(LAT, LON);

    expect(result).toBeNull();
    // One call — no second attempt at a host that is not there to time out on.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to Photon when one IS configured', async () => {
    const geo = await controllerWith({ google: 'key_1', photon: 'http://photon:2322' });
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          features: [{ properties: { name: 'Wien', city: 'Wien' }, geometry: { coordinates: [16.37, 48.2] } }],
        }),
      } as unknown as Response);

    const { result } = await geo.reverse(LAT, LON);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1]![0])).toContain('photon:2322');
    expect(result?.label).toBeTruthy();
  });

  it('search stops at Google when there is no Photon to fall through to', async () => {
    const geo = await controllerWith({ google: 'key_1' });
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) } as unknown as Response);

    const out = await geo.search('vienna');

    expect(out.results).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
