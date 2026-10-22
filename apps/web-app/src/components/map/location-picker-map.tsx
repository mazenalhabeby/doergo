"use client"

import { useEffect } from "react"
import { useMapEvents, useMap } from "react-leaflet"
import { type LatLng } from "@hbcfield/shared/client"

// The small map helpers the location picker draws with.
/**
 * Leaflet caches the size of its container and only re-reads it when told. Grow
 * the box without saying so and it keeps drawing for the old one: tiles stop
 * halfway across, and — worse while drawing — a click lands at the wrong
 * latitude, because the pixel-to-coordinate maths still uses the small box.
 */
export function InvalidateSizeOn({ token }: { token: unknown }) {
  const map = useMap()
  useEffect(() => {
    // After the browser has laid the new box out, not before.
    const frame = requestAnimationFrame(() => map.invalidateSize())
    return () => cancelAnimationFrame(frame)
  }, [map, token])
  return null
}

export function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/** Metres across the widest part of a ring — the number that tells an admin
 *  at a glance whether they have drawn the property or the neighbourhood. */
export function widestSpanMetres(ring: LatLng[]): number {
  let max = 0
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const a = ring[i]
      const b = ring[j]
      if (!a || !b) continue
      const dLat = (b.lat - a.lat) * 111_320
      const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
      max = Math.max(max, Math.hypot(dLat, dLng))
    }
  }
  return max
}

/**
 * Remembers where the map was looking.
 *
 * Opening the map moves it into a dialog, which remounts Leaflet, and a
 * remounted map returns to its initial centre and zoom. Without this, zooming
 * in on a loading bay and then opening the map for a closer look throws that
 * away and starts again from the whole city — the opposite of what was asked
 * for.
 */
export function ViewTracker({ onChange }: { onChange: (view: { center: [number, number]; zoom: number }) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter()
      onChange({ center: [c.lat, c.lng], zoom: map.getZoom() })
    },
  })
  return null
}

export function MapPanner({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15))
  }, [map, lat, lng])
  return null
}
