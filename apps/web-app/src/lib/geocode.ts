// Helpers to turn raw geocoder payloads into a clean, human address like
// "Kapellenstraße 30, 4664 Laakirchen" instead of the long hierarchy string
// (…Oberweis, Bergham, …) that Nominatim's `display_name` returns.

export interface NominatimAddress {
  road?: string
  pedestrian?: string
  footway?: string
  house_number?: string
  suburb?: string
  neighbourhood?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  hamlet?: string
  postcode?: string
  county?: string
  state?: string
  country?: string
}

/** Compose "Street Number, Postcode City" from Nominatim's structured address. */
export function formatNominatimAddress(a?: NominatimAddress | null, fallback?: string): string {
  if (!a) return fallback ?? ""
  const street = a.road || a.pedestrian || a.footway || ""
  // Austrian/German order: street then house number ("Kapellenstraße 30").
  const line1 = [street, a.house_number].filter(Boolean).join(" ")
  const city = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || ""
  const line2 = [a.postcode, city].filter(Boolean).join(" ")
  const out = [line1, line2].filter(Boolean).join(", ")
  return out || fallback || ""
}

/**
 * The Photon (Komoot) feature properties this reads.
 *
 * Typed as the strings it actually uses rather than `any`: every field below is
 * read into a string join, so `any` bought nothing and hid the one thing worth
 * knowing — which keys this function depends on.
 */
export interface PhotonProperties {
  street?: string
  name?: string
  housenumber?: string
  city?: string
  county?: string
  state?: string
  postcode?: string
}

/** Compose the same clean address from a Photon (Komoot) feature's properties. */
export function formatPhotonFeature(p: PhotonProperties | undefined, fallback?: string): string {
  if (!p) return fallback ?? ""
  const street = p.street || p.name || ""
  const line1 = [street, p.housenumber].filter(Boolean).join(" ")
  const city = p.city || p.county || p.state || ""
  const line2 = [p.postcode, city].filter(Boolean).join(" ")
  const out = [line1, line2].filter(Boolean).join(", ")
  return out || p.name || fallback || ""
}

/**
 * Where the geocoding proxy lives.
 *
 * ⚠️ The fallback is `/api/v1`, not "". `NEXT_PUBLIC_API_URL` is inlined at
 * build time and is simply absent in some environments; an empty base makes the
 * request relative, so it lands on the Next server instead of the gateway and
 * returns a 404 that reads like "this address could not be found".
 */
export const geoBase = () => process.env.NEXT_PUBLIC_API_URL || '/api/v1';

/**
 * Turn a written address into a point, or null.
 *
 * For addresses the product already holds — a client's, typed by a person long
 * before anyone thought about maps. Without a point there is no destination to
 * navigate to and no route to measure, so a visit task is a task with a note in
 * it. Null is an ordinary answer, not a failure: the text still names the place.
 *
 * Never called per keystroke — once, when a place is chosen — so it uses no
 * autocomplete session token.
 */
export async function geocodeAddress(
  text: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lng: number } | null> {
  const q = text.trim();
  if (q.length < 3) return null;
  const base = geoBase();
  try {
    const r = await fetch(`${base}/geo/search?q=${encodeURIComponent(q)}&limit=1`, {
      signal: signal ?? AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const hit = (await r.json())?.results?.[0];
    if (!hit) return null;
    if (typeof hit.lat === 'number' && typeof hit.lon === 'number') {
      return { lat: hit.lat, lng: hit.lon };
    }
    // A Google prediction carries no coordinates until it is resolved.
    if (hit.id) {
      const pr = await fetch(`${base}/geo/place?id=${encodeURIComponent(hit.id)}`, {
        signal: signal ?? AbortSignal.timeout(5000),
      });
      if (!pr.ok) return null;
      const place = (await pr.json())?.result;
      if (typeof place?.lat === 'number' && typeof place?.lon === 'number') {
        return { lat: place.lat, lng: place.lon };
      }
    }
    return null;
  } catch {
    return null; // offline, slow, or refused — the caller keeps the text
  }
}
