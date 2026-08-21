"use client"

import { TileLayer, AttributionControl } from "react-leaflet"
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION } from "@/lib/map-tiles"

/**
 * The base map layer, carrying the credit its licence requires — and nothing else.
 *
 * Two different things end up in that corner of a Leaflet map, and only one of
 * them is obligatory:
 *
 *   • "© MapTiler © OpenStreetMap" is a licence condition. OpenStreetMap's data
 *     is ODbL, and MapTiler's terms require the same. It stays.
 *   • "Leaflet" is the mapping library advertising itself. Leaflet adds it by
 *     default through the attribution control's `prefix`, it credits no data,
 *     and no licence asks for it. `prefix={false}` removes it.
 *
 * Worth being precise about, because the two look identical on screen and the
 * obvious fix — switching the attribution control off — takes the required
 * credit down with the advertisement. That is how all four maps were until
 * recently: no control at all, and therefore no attribution.
 *
 * Every map renders this instead of its own <TileLayer>, so the tile host and
 * its credit are decided in one place. The MapContainer that uses it must pass
 * `attributionControl={false}`, otherwise Leaflet builds its own default
 * control and the prefix comes back.
 */
export function BaseTiles() {
  return (
    <>
      <TileLayer url={MAP_TILE_URL} attribution={MAP_TILE_ATTRIBUTION} />
      <AttributionControl prefix={false} />
    </>
  )
}
