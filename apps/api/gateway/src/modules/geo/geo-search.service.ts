import { Injectable } from '@nestjs/common';
import { GOOGLE_BASE, GOOGLE_GEOCODE_BASE, GOOGLE_KEY, PHOTON_URL, TIMEOUT_MS } from './geo-providers';

const GEO_MAX_QUERY = 200;

export interface GeoResult {
  label: string;
  lat: number;
  lon: number;
  city?: string;
  country?: string;
}

// Autocomplete prediction: no coordinates yet (resolved via /geo/place on pick).
export interface GeoSuggestion {
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

/**
 * The geocoders behind /geo — Google Places (search, place details) and Google Geocoding (reverse) first,
 * a self-hosted Photon second, neither required. Server-side so the provider key never reaches a client.
 * Moved out of GeoController unchanged (code-structure-fix 4.5): a controller routes, it does not fetch.
 */
@Injectable()
export class GeoSearchService {
  async search(
    q?: string,
    session?: string,
    lat?: string,
    lon?: string,
    limit?: string,
  ): Promise<{ results: GeoSuggestion[]; provider: 'google' | 'photon' }> {
    const query = (q || '').trim();
    if (query.length < 2 || query.length > GEO_MAX_QUERY)
      return { results: [], provider: GOOGLE_KEY ? 'google' : 'photon' };
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

  async place(id?: string, session?: string): Promise<{ result: GeoResult | null }> {
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

  async reverse(lat?: string, lon?: string): Promise<{ result: GeoResult | null }> {
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
