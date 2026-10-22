import { Injectable } from '@nestjs/common';

/**
 * "City, CC" for a clock-in or clock-out coordinate, cached per ~1km.
 * One instance, so the clock-in and the clock-out share the cache.
 */
@Injectable()
export class AttendanceGeocoderService {
  /**
   * Coarse reverse-geocode (city-level) via OpenStreetMap Nominatim. Returns
   * e.g. "Vienna, AT", or null on failure. zoom=10 keeps it to city/area
   * granularity (never a precise street) for privacy.
   */
  // ~1km-rounded coord → resolved place. Place names are stable, so caching
  // spares the geocoder entirely for repeated clock-ins at the same site. Only
  // successful lookups are cached (a transient failure retries next time).
  private readonly geocodeCache = new Map<string, string>();

  /**
   * Turn a coordinate into "City, CC".
   *
   * Through the gateway's own /geo/reverse rather than any geocoder directly,
   * so the provider chain lives in ONE place: this service does not need the
   * Google key, does not need to know whether Photon exists, and follows
   * whatever that endpoint is configured to use. It is a @Public() route on the
   * internal network — no credentials cross the wire.
   *
   * Previously this called nominatim.openstreetmap.org itself: a public service
   * under a policy permitting neither heavy nor commercial use, on a path that
   * grows with every remote clock-in.
   *
   * No fallback on purpose. If the chain has nothing, the entry records no
   * place name — which is exactly what a geocoder timeout always did.
   */
  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = this.geocodeCache.get(key);
    if (cached !== undefined) return cached;

    let place: string | null = null;
    try {
      const base = process.env.INTERNAL_API_URL?.trim() || 'http://api-gateway:4000/api/v1';
      // Hard 1.5s timeout so a slow geocoder cannot stall the (shared)
      // attendance queue slot, including the reminder/no-show sweep.
      const res = await fetch(`${base}/geo/reverse?lat=${lat}&lon=${lng}`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const j = await res.json();
        // City granularity, never a street — this is a privacy boundary, not a
        // formatting choice.
        const city = j?.result?.city;
        const country = j?.result?.country;
        if (city) place = country ? `${city}, ${country}` : city;
      }
    } catch {
      place = null; // timeout / network — don't cache, let it retry later
    }

    if (place !== null) {
      if (this.geocodeCache.size > 2000) this.geocodeCache.clear();
      this.geocodeCache.set(key, place);
    }
    return place;
  }
}
