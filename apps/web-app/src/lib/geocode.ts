import { getResponse, type PlainResponse, type RequestOptions } from "./http-client"
// Helpers to turn raw geocoder payloads into a clean, human address like
// "Kapellenstraße 30, 4664 Laakirchen" instead of the long hierarchy string
// (…Oberweis, Bergham, …) that Nominatim's `display_name` returns.

/** What the gateway's `/geo/*` proxy answers (a JSON body; every field is checked where it is read). */
export interface GeoHit {
  id?: string
  label: string
  lat?: number
  lon?: number
}
export interface GeoSearchAnswer {
  results?: GeoHit[]
}
export interface GeoPlaceAnswer {
  result?: { label?: string; lat?: number; lon?: number }
}
export interface GeoTimezoneAnswer {
  timezone?: unknown
}

/**
 * Every call to the gateway's `/geo/*` proxy goes through here — the same
 * request pipeline as every other API call: the caller's bearer token (and a
 * refresh on 401), a timeout, and 429 handling.
 *
 * They were bare `fetch`es. search/place/reverse are still `@Public()` on the
 * gateway — installed phone apps call them without a token — so they worked
 * anonymously, which leaves a paid Google proxy open to anybody. Sending the
 * token from the web is the first half of closing it; `/geo/timezone` is
 * authenticated already and was refused without it.
 *
 * Resolves like `fetch` (`ok`, `status`, `json()`); rejects when there was no answer.
 */
export function geoFetch(pathAndQuery: string, init: RequestOptions = {}): Promise<PlainResponse> {
  return getResponse(pathAndQuery, { timeoutMs: 10_000, ...init })
}

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
export async function geocodeAddress(text: string, signal?: AbortSignal): Promise<{ lat: number; lng: number } | null> {
  const q = text.trim()
  if (q.length < 3) return null
  try {
    const r = await geoFetch(`/geo/search?q=${encodeURIComponent(q)}&limit=1`, {
      signal: signal ?? AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    const hit = ((await r.json()) as GeoSearchAnswer | null)?.results?.[0]
    if (!hit) return null
    if (typeof hit.lat === "number" && typeof hit.lon === "number") {
      return { lat: hit.lat, lng: hit.lon }
    }
    // A Google prediction carries no coordinates until it is resolved.
    if (hit.id) {
      const pr = await geoFetch(`/geo/place?id=${encodeURIComponent(hit.id)}`, {
        signal: signal ?? AbortSignal.timeout(5000),
      })
      if (!pr.ok) return null
      const place = ((await pr.json()) as GeoPlaceAnswer | null)?.result
      if (typeof place?.lat === "number" && typeof place?.lon === "number") {
        return { lat: place.lat, lng: place.lon }
      }
    }
    return null
  } catch {
    return null // offline, slow, or refused — the caller keeps the text
  }
}
