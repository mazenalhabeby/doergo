import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators';

// Self-hosted Photon (full-planet index) — reached over the internal docker
// network. Geocoding stays server-side so no third-party key is exposed and we
// avoid the public OSM rate limits that made the old client-side search flaky.
const PHOTON_URL = process.env.PHOTON_URL || 'http://photon:2322';
const TIMEOUT_MS = 5000;

interface GeoResult {
  label: string;
  lat: number;
  lon: number;
  city?: string;
  country?: string;
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
  /** Forward geocode / autocomplete. GET /geo/search?q=&lat=&lon=&limit= */
  @Public()
  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('limit') limit?: string,
  ): Promise<{ results: GeoResult[] }> {
    if (!q || q.trim().length < 2) return { results: [] };
    const params = new URLSearchParams({ q: q.trim(), limit: String(Math.min(Number(limit) || 6, 10)), lang: 'en' });
    // Bias results toward a location when the caller has a map centre.
    if (lat && lon && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon))) {
      params.set('lat', lat);
      params.set('lon', lon);
    }
    try {
      const res = await fetch(`${PHOTON_URL}/api?${params.toString()}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { results: [] };
      const data: any = await res.json();
      return { results: (data?.features || []).map(featureToResult).filter(Boolean) as GeoResult[] };
    } catch {
      return { results: [] };
    }
  }

  /** Reverse geocode. GET /geo/reverse?lat=&lon= */
  @Public()
  @Get('reverse')
  async reverse(@Query('lat') lat?: string, @Query('lon') lon?: string): Promise<{ result: GeoResult | null }> {
    if (!lat || !lon || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) return { result: null };
    try {
      const res = await fetch(`${PHOTON_URL}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&lang=en`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { result: null };
      const data: any = await res.json();
      const feature = (data?.features || [])[0];
      return { result: feature ? featureToResult(feature) : null };
    } catch {
      return { result: null };
    }
  }
}
