/**
 * The geocoders, configured once — the address search, the map's reverse lookup and the workspace
 * holiday detector all read these, so a provider is switched on or off in one place.
 *
 * Google: the Geocoding API (reverse) is a different product from Places (search) and must be
 * enabled on the key separately; it bills per request. Photon: self-hosted and OPT-IN — unset means
 * Google is the only geocoder.
 */
export const PHOTON_URL = process.env.PHOTON_URL?.trim() || null;
export const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
export const GOOGLE_BASE = 'https://places.googleapis.com/v1';
export const GOOGLE_GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';
export const TIMEOUT_MS = 5000;

/** Country + state of a map point, as the geocoder names them. */
export interface AdminPlace {
  /** ISO 3166-1 alpha-2, upper case. */
  country: string;
  /** The state as a short code where the provider has one ("NV", "BY"), else as named. */
  stateCode: string | null;
  stateName: string | null;
}

/**
 * Which country and state a point is in. Google first (it gives the ISO country code and a state
 * short code), Photon second. Null when neither answers — the caller keeps what it had.
 */
export async function lookupAdminPlace(lat: number, lng: number): Promise<AdminPlace | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (GOOGLE_KEY) {
    try {
      const url = `${GOOGLE_GEOCODE_BASE}?latlng=${encodeURIComponent(`${lat},${lng}`)}&result_type=administrative_area_level_1|country&language=en&key=${GOOGLE_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) {
        const data: any = await res.json();
        const comps: any[] = (data?.results || []).flatMap((r: any) => r.address_components || []);
        const find = (type: string) => comps.find((c) => (c.types || []).includes(type));
        const country = find('country')?.short_name;
        if (typeof country === 'string' && /^[A-Za-z]{2}$/.test(country)) {
          const state = find('administrative_area_level_1');
          return { country: country.toUpperCase(), stateCode: state?.short_name ?? null, stateName: state?.long_name ?? null };
        }
      }
    } catch {
      /* fall through to Photon */
    }
  }
  if (!PHOTON_URL) return null;
  try {
    const res = await fetch(`${PHOTON_URL}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&lang=en`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const p = ((await res.json())?.features || [])[0]?.properties;
    const cc = p?.countrycode;
    if (typeof cc !== 'string' || !/^[A-Za-z]{2}$/.test(cc)) return null;
    return { country: cc.toUpperCase(), stateCode: null, stateName: typeof p.state === 'string' ? p.state : null };
  } catch {
    return null;
  }
}
