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

  TODO(geo-auth): the WEB half is done — every web /geo call goes through
  `geoFetch` (web-app lib/geocode.ts), which sends the bearer token. Drop
  @Public on search / place / reverse once NO installed phone app can still call
  without a token: the phone's location-search-picker sends it (fetchWithAuth),
  that JS has reached every runtime train in use by OTA, and `MOBILE_MIN_VERSION`
  refuses any binary older than those trains.
  /geo/timezone is authenticated and stays so.
*/
const GEO_SEARCH_LIMIT = { default: { limit: 40, ttl: 60_000 } };
const GEO_PLACE_LIMIT = { default: { limit: 20, ttl: 60_000 } };
const GEO_REVERSE_LIMIT = { default: { limit: 30, ttl: 60_000 } };
/** Longer than any address a person types; a provider call is never spent on more. */

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
import { GeoSearchService, type GeoResult, type GeoSuggestion } from './geo-search.service';

@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoSearchService) {}

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
    return this.geo.search(q, session, lat, lon, limit);
  }

  /**
   * Resolve a Google placeId to coordinates (closes the billed session).
   * GET /geo/place?id=&session=
   */
  @Public()
  @Throttle(GEO_PLACE_LIMIT)
  @Get('place')
  async place(@Query('id') id?: string, @Query('session') session?: string): Promise<{ result: GeoResult | null }> {
    return this.geo.place(id, session);
  }

  /** Reverse geocode (map taps). GET /geo/reverse?lat=&lon= — Photon (free). */
  @Public()
  @Throttle(GEO_REVERSE_LIMIT)
  @Get('reverse')
  async reverse(@Query('lat') lat?: string, @Query('lon') lon?: string): Promise<{ result: GeoResult | null }> {
    return this.geo.reverse(lat, lon);
  }
}
