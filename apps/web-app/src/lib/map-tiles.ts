/**
 * Where map tiles come from.
 *
 * Every Leaflet map in the app read `tile.openstreetmap.org` directly, with the
 * URL typed out in four files. Two problems with that, and neither is a bill:
 *
 *   • OpenStreetMap's Tile Usage Policy does not permit commercial or heavy
 *     traffic against those servers. The failure mode is not an invoice, it is
 *     being blocked — and it would take every map in the product at once.
 *   • The tiles are ODbL data. Attribution is a licence condition, not a
 *     courtesy, and all four maps had the attribution control switched off.
 *
 * So the host is configuration now. Unset, it still points at OSM, because a
 * developer running this locally is exactly the low-volume case the policy
 * allows. Production sets NEXT_PUBLIC_MAP_TILE_URL at a paid host or your own
 * tile server, and NEXT_PUBLIC_MAP_TILE_ATTRIBUTION to whatever that host
 * requires you to display.
 */

/** Leaflet template — `{s}` subdomain, `{z}/{x}/{y}` tile coordinates. */
export const MAP_TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Shown in the corner of every map. Required by OSM's licence, and by most
 * paid hosts' terms as well — which is why it is not optional here.
 */
export const MAP_TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** True while still pointed at OSM's public servers — i.e. not for real volume. */
export const USING_PUBLIC_OSM_TILES = !process.env.NEXT_PUBLIC_MAP_TILE_URL;
