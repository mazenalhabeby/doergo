import L from "leaflet"
import markerIconPng from "leaflet/dist/images/marker-icon.png"
import markerIcon2xPng from "leaflet/dist/images/marker-icon-2x.png"
import markerShadow from "leaflet/dist/images/marker-shadow.png"

/**
 * Leaflet's default pin, bundled from the package.
 *
 * Leaflet guesses its image path from its CSS, which a bundler breaks, so every
 * map used to build its own icon pointing at a public CDN — three copies, and every
 * map view asked a third-party CDN for the pin (the visitor's IP included).
 * The pngs are imported instead, so they ship with the app and are cached with it.
 */
export const markerIcon: L.Icon = L.icon({
  iconUrl: markerIconPng.src,
  iconRetinaUrl: markerIcon2xPng.src,
  shadowUrl: markerShadow.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
