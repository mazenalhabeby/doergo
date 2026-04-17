"use client"

import { useMemo, useEffect, useState } from "react"
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import { Navigation, Flag, Clock } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"

interface RoutePoint {
  lat: number
  lng: number
  timestamp: string
}

interface RouteMapViewProps {
  points: RoutePoint[]
  isLive?: boolean
}

// Create custom marker icons
function createMarkerIcon(type: "start" | "end" | "current") {
  const colors = {
    start: { bg: "#22c55e", border: "#16a34a" },
    end: { bg: "#3b82f6", border: "#2563eb" },
    current: { bg: "#f59e0b", border: "#d97706" },
  }

  const color = colors[type]
  const IconComponent = type === "start" ? Navigation : type === "end" ? Flag : Navigation

  const iconHtml = renderToStaticMarkup(
    <div
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        backgroundColor: color.bg,
        border: `3px solid ${color.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      <IconComponent size={16} color="white" />
    </div>
  )

  return L.divIcon({
    html: iconHtml,
    className: "custom-marker",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })
}

/**
 * Snap GPS points to actual roads using OSRM's free match API.
 * Falls back to raw points if the API fails.
 */
async function snapToRoads(points: RoutePoint[]): Promise<[number, number][]> {
  if (points.length < 2) return points.map(p => [p.lat, p.lng])

  // OSRM expects max ~100 coordinates per request, sample if needed
  let sampled = points
  if (points.length > 100) {
    const step = Math.ceil(points.length / 100)
    sampled = points.filter((_, i) => i % step === 0)
    // Always include last point
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1])
    }
  }

  // OSRM uses lng,lat order
  const coords = sampled.map(p => `${p.lng},${p.lat}`).join(';')
  const timestamps = sampled.map(p => Math.floor(new Date(p.timestamp).getTime() / 1000)).join(';')

  try {
    const url = `https://router.project-osrm.org/match/v1/driving/${coords}?overview=full&geometries=geojson&timestamps=${timestamps}`
    const res = await fetch(url)
    const data = await res.json()

    if (data.code === 'Ok' && data.matchings?.[0]?.geometry?.coordinates) {
      // OSRM returns [lng, lat], convert to [lat, lng] for Leaflet
      return data.matchings[0].geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]] as [number, number]
      )
    }
  } catch (err) {
    console.warn('OSRM road snap failed, using raw GPS points:', err)
  }

  // Fallback: raw GPS points
  return points.map(p => [p.lat, p.lng])
}

export default function RouteMapView({ points, isLive = false }: RouteMapViewProps) {
  const [roadPath, setRoadPath] = useState<[number, number][]>([])
  const [loading, setLoading] = useState(true)

  // Raw GPS polyline (fallback / shown while loading)
  const rawPositions = useMemo(() => {
    return points.map((p) => [p.lat, p.lng] as [number, number])
  }, [points])

  // Snap GPS to roads
  useEffect(() => {
    if (points.length < 2) {
      setRoadPath(rawPositions)
      setLoading(false)
      return
    }

    setLoading(true)
    snapToRoads(points).then(path => {
      setRoadPath(path)
      setLoading(false)
    })
  }, [points, rawPositions])

  const displayPath = roadPath.length > 0 ? roadPath : rawPositions

  // Calculate map bounds
  const bounds = useMemo(() => {
    if (displayPath.length === 0) return null
    return L.latLngBounds(displayPath)
  }, [displayPath])

  // Start and end points
  const startPoint = points.length > 0 ? points[0] : null
  const endPoint = points.length > 1 ? points[points.length - 1] : null

  const startIcon = useMemo(() => createMarkerIcon("start"), [])
  const endIcon = useMemo(() => createMarkerIcon(isLive ? "current" : "end"), [isLive])

  if (points.length === 0) {
    return (
      <div className="h-64 bg-slate-100 rounded-xl flex items-center justify-center">
        <p className="text-sm text-slate-500">No route data available</p>
      </div>
    )
  }

  const center = bounds ? bounds.getCenter() : { lat: points[0].lat, lng: points[0].lng }

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ height: "320px", width: "100%" }}
        scrollWheelZoom={false}
        bounds={bounds || undefined}
        boundsOptions={{ padding: [50, 50] }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Road-snapped route (main path) */}
        <Polyline
          positions={displayPath}
          pathOptions={{
            color: "#2563eb",
            weight: 5,
            opacity: 0.85,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        {/* Start marker */}
        {startPoint && (
          <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon}>
            <Popup>
              <div className="text-center p-1">
                <p className="font-semibold text-slate-800">Start Point</p>
                <p className="text-xs text-slate-500 flex items-center justify-center gap-1 mt-1">
                  <Clock size={12} />
                  {new Date(startPoint.timestamp).toLocaleString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* End/Current marker */}
        {endPoint && (
          <Marker position={[endPoint.lat, endPoint.lng]} icon={endIcon}>
            <Popup>
              <div className="text-center p-1">
                <p className="font-semibold text-slate-800">
                  {isLive ? "Current Location" : "Destination"}
                </p>
                <p className="text-xs text-slate-500 flex items-center justify-center gap-1 mt-1">
                  <Clock size={12} />
                  {new Date(endPoint.timestamp).toLocaleString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Map legend */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-green-500" />
            <span>Start</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`size-3 rounded-full ${isLive ? "bg-amber-500" : "bg-blue-500"}`} />
            <span>{isLive ? "Current" : "End"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-0.5 bg-blue-600 rounded" />
            <span>Route</span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {points.length} GPS points
        </p>
      </div>
    </div>
  )
}
