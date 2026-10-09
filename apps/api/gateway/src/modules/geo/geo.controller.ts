import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';

/*
  ⚠️ WHY search / place / reverse ARE STILL @Public — and throttled hard.

  They proxy the BILLED Google key, so anonymous access is spend anybody can
  cause. They should require a session. They cannot today without breaking every
  location picker: the web (components/location-picker.tsx, locations/_components/
  location-picker.tsx, lib/geocode.ts) and the phone (location-search-picker.tsx)
  call them with a bare \`fetch\` that carries no Authorization header, and the
  phone's copy is in installed binaries. Removing @Public first would turn every
  address search into a 401.

  Until those callers send the token (web: the api client; phone: fetchWithAuth +
  an OTA), each route carries a tight per-IP limit — far above one person
  typing an address, far below anybody running a key-spend loop — and refuses
  absurd input before a provider is called. Then drop @Public here.
*/
const GEO_SEARCH_LIMIT = { default: { limit: 40, ttl: 60_000 } };
const GEO_PLACE_LIMIT = { default: { limit: 20, ttl: 60_000 } };
const GEO_REVERSE_LIMIT = { default: { limit: 30, ttl: 60_000 } };
/** Longer than any address a person types; a provider call is never spent on more. */
const GEO_MAX_QUERY = 200;

// tz-lookup: offline coords → IANA timezone (no types pkg).
const tzlookup: (lat: number, lon: number) => string = require('tz-lookup');

// Geocoding stays server-side so the provider key is never exposed to clients
// and we avoid public OSM rate limits.
//
// Primary: Google Places API (New) — the same coverage as the Google Maps
// search box (200M+ businesses/POIs). Uses the session-token pattern so the
// as-you-type Autocomplete calls are free and only ONE Place Details call (to
// resolve coordinates on selection) is billed — 10k/month free.
// Fallback: self-hosted full-planet Photon over the docker network — used when
// no Google key is configured (local dev) or Google errors.
/*
  Self-hosted Photon, if there is one.

  OPT-IN. It used to default to `http://photon:2322`, so with the container
  gone every Google miss still spent a connection attempt and a timeout proving
  nothing was listening. Unset simply means Google is the only geocoder.
*/
import { GOOGLE_BASE, GOOGLE_GEOCODE_BASE, GOOGLE_KEY, PHOTON_URL, TIMEOUT_MS } from './geo-providers';

interface GeoResult {
  label: string;
  lat: number;
  lon: number;
  city?: string;
  country?: string;
}

// Autocomplete prediction: no coordinates yet (resolved via /geo/place on pick).
interface GeoSuggestion {
  id: string; // Google placeId, or '' for Photon fallback rows (which carry lat/lon)
  label: string;
  lat?: number;
  lon?: number;
}

/** Photon returns GeoJSON; collapse a feature into a flat, display-ready result. */
function featureToResult(f: any): GeoResult | null {
  const coords = f?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const p = f.properties || {};
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const parts = [p.name, street, p.postcode, p.city || p.town || p.village, p.state, p.country]
    .map((s) => (typeof s === 'string' ? s.trim() : s))
    .filter(Boolean);
  return {
    label: [...new Set(parts)].join(', '),
    lat: coords[1],
    lon: coords[0],
    city: p.city || p.town || p.village || undefined,
    country: p.country || undefined,
  };
}

@Controller('geo')
export class GeoController {
  /**
   * IANA timezone for a coordinate — GET /geo/timezone?lat=&lon=
   * Offline lookup; lets the space-settings form auto-fill the timezone the
   * moment the admin drops a pin on the map (same derivation the server uses on
   * save). Returns { timezone: string | null }.
   */
  @Get('timezone')
  timezone(@Query('lat') lat?: string, @Query('lon') lon?: string): { timezone: string | null } {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0)) {
      return { timezone: null };
    }
    try {
      return { timezone: tzlookup(la, lo) };
    } catch {
      return { timezone: null };
    }
  }

  /**
   * Autocomplete suggestions. GET /geo/search?q=&session=&lat=&lon=&limit=
   * Google rows return { id, label } (call /geo/place to get coordinates).
   * Photon fallback rows return { id: '', label, lat, lon } (usable directly).
   */
  @Public()
  @Throttle(GEO_SEARCH_LIMIT)
  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('session') session?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('limit') limit?: string,
  ): Promise<{ results: GeoSuggestion[]; provider: 'google' | 'photon' }> {
    const query = (q || '').trim();
    if (query.length < 2 || query.length > GEO_MAX_QUERY) return { results: [], provider: GOOGLE_KEY ? 'google' : 'photon' };
    const max = Math.min(Number(limit) || 6, 10);

    // Primary: Google Places Autocomplete (New) — free with a session token.
    if (GOOGLE_KEY) {
      try {
        const body: any = { input: query, languageCode: 'en' };
        if (session) body.sessionToken = session;
        if (lat && lon && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon))) {
          body.locationBias = {
            circle: { center: { latitude: Number(lat), longitude: Number(lon) }, radius: 50000 },
          };
        }
        const res = await fetch(`${GOOGLE_BASE}/places:autocomplete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) {
          const data: any = await res.json();
          const results: GeoSuggestion[] = (data?.suggestions || [])
            .map((s: any) => s?.placePrediction)
            .filter(Boolean)
            .slice(0, max)
            .map((p: any) => ({ id: p.placeId as string, label: (p.text?.text as string) || '' }))
            .filter((r: GeoSuggestion) => r.id && r.label);
          if (results.length > 0) return { results, provider: 'google' };
        }
      } catch {
        /* fall through to Photon */
      }
    }

    // Fallback: Photon, when one is configured (returns coordinates inline).
    if (!PHOTON_URL) return { results: [], provider: 'google' };
    try {
      const params = new URLSearchParams({ q: query, limit: String(max), lang: 'en' });
      if (lat && lon && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon))) {
        params.set('lat', lat);
        params.set('lon', lon);
      }
      const res = await fetch(`${PHOTON_URL}/api?${params.toString()}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { results: [], provider: 'photon' };
      const data: any = await res.json();
      const results: GeoSuggestion[] = ((data?.features || []).map(featureToResult).filter(Boolean) as GeoResult[]).map(
        (r) => ({ id: '', label: r.label, lat: r.lat, lon: r.lon }),
      );
      return { results, provider: 'photon' };
    } catch {
      return { results: [], provider: 'photon' };
    }
  }

  /**
   * Resolve a Google placeId to coordinates (closes the billed session).
   * GET /geo/place?id=&session=
   */
  @Public()
  @Throttle(GEO_PLACE_LIMIT)
  @Get('place')
  async place(@Query('id') id?: string, @Query('session') session?: string): Promise<{ result: GeoResult | null }> {
    // A Google place id is a few hundred characters at most.
    if (!id || id.length > 512 || !GOOGLE_KEY) return { result: null };
    try {
      const url = new URL(`${GOOGLE_BASE}/places/${encodeURIComponent(id)}`);
      url.searchParams.set('languageCode', 'en');
      if (session) url.searchParams.set('sessionToken', session);
      const res = await fetch(url.toString(), {
        headers: {
          'X-Goog-Api-Key': GOOGLE_KEY,
          // Essentials-tier fields only, to stay in the cheapest Place Details SKU.
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { result: null };
      const p: any = await res.json();
      const loc = p?.location;
      if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return { result: null };
      const comps: any[] = Array.isArray(p.addressComponents) ? p.addressComponents : [];
      const byType = (t: string) => comps.find((c) => (c.types || []).includes(t))?.longText as string | undefined;
      const name = p.displayName?.text as string | undefined;
      const addr = p.formattedAddress as string | undefined;
      return {
        result: {
          label: [name, addr].filter(Boolean).join(', ') || addr || name || '',
          lat: loc.latitude,
          lon: loc.longitude,
          city: byType('locality') || byType('postal_town') || undefined,
          country: byType('country') || undefined,
        },
      };
    } catch {
      return { result: null };
    }
  }

  /** Reverse geocode (map taps). GET /geo/reverse?lat=&lon= — Photon (free). */
  @Public()
  @Throttle(GEO_REVERSE_LIMIT)
  @Get('reverse')
  async reverse(@Query('lat') lat?: string, @Query('lon') lon?: string): Promise<{ result: GeoResult | null }> {
    if (!lat || !lon || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) return { result: null };

    /*
      Google first, our own Photon second, and neither is required.

      This used to be Photon-only, which meant reverse geocoding died with the
      container — taking map-click auto-fill and the "Remote · city" label on a
      clock-in with it. Either provider alone is now enough, so Photon can be
      removed without anything going quiet.
    */
    if (GOOGLE_KEY) {
      try {
        const url = `${GOOGLE_GEOCODE_BASE}?latlng=${encodeURIComponent(`${lat},${lon}`)}&language=en&key=${GOOGLE_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.ok) {
          const data: any = await res.json();
          const first = (data?.results || [])[0];
          if (first?.formatted_address) {
            const comp: any[] = first.address_components || [];
            const pick = (type: string) =>
              comp.find((c) => (c.types || []).includes(type))?.long_name as string | undefined;
            return {
              result: {
                label: first.formatted_address as string,
                lat: Number(first.geometry?.location?.lat ?? lat),
                lon: Number(first.geometry?.location?.lng ?? lon),
                city: pick('locality') || pick('postal_town') || pick('administrative_area_level_2'),
                country: pick('country'),
              },
            };
          }
        }
      } catch {
        /* fall through to Photon */
      }
    }

    if (!PHOTON_URL) return { result: null };
    try {
      const res = await fetch(
        `${PHOTON_URL}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&lang=en`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!res.ok) return { result: null };
      const data: any = await res.json();
      const feature = (data?.features || [])[0];
      return { result: feature ? featureToResult(feature) : null };
    } catch {
      return { result: null };
    }
  }
}
