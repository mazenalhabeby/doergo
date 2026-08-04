import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators';

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
const PHOTON_URL = process.env.PHOTON_URL || 'http://photon:2322';
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const GOOGLE_BASE = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 5000;

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
  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('session') session?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('limit') limit?: string,
  ): Promise<{ results: GeoSuggestion[]; provider: 'google' | 'photon' }> {
    const query = (q || '').trim();
    if (query.length < 2) return { results: [], provider: GOOGLE_KEY ? 'google' : 'photon' };
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

    // Fallback: Photon (returns coordinates inline; no place lookup needed).
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
  @Get('place')
  async place(@Query('id') id?: string, @Query('session') session?: string): Promise<{ result: GeoResult | null }> {
    if (!id || !GOOGLE_KEY) return { result: null };
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
  @Get('reverse')
  async reverse(@Query('lat') lat?: string, @Query('lon') lon?: string): Promise<{ result: GeoResult | null }> {
    if (!lat || !lon || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) return { result: null };
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
