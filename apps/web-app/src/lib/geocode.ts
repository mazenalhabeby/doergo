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
