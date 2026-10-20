"use client"

import { MapContainer, Marker } from "react-leaflet"
import { BaseTiles } from "@/components/map/base-tiles"
import { markerIcon } from "@/lib/leaflet-icon"

// Leaflet CSS is imported globally (app/globals.css).

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
      <BaseTiles />
      <Marker position={[lat, lng]} icon={markerIcon} />
    </MapContainer>
  )
}
