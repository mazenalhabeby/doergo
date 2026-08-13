"use client"

import { MapContainer, TileLayer, Marker } from "react-leaflet"
import L from "leaflet"

// Leaflet CSS is imported globally (app/globals.css). Default marker icons.
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

/** Read-only map showing a single address marker. */
export default function AddressMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <MapContainer
      key={`${lat},${lng}`}
      center={[lat, lng]}
      zoom={15}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[lat, lng]} icon={icon} />
    </MapContainer>
  )
}
