"use client"

import { useMemo } from "react"
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
    start: { bg: "#22c55e", border: "#16a34a" }, // green
    end: { bg: "#3b82f6", border: "#2563eb" }, // blue
    current: { bg: "#f59e0b", border: "#d97706" }, // amber
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

export default function RouteMapView({ points, isLive = false }: RouteMapViewProps) {
  // Convert points to [lat, lng] format for polyline
  const polylinePositions = useMemo(() => {
    return points.map((p) => [p.lat, p.lng] as [number, number])
  }, [points])

  // Calculate map bounds to fit all points
  const bounds = useMemo(() => {
    if (points.length === 0) return null
    return L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
  }, [points])

  // Get start and end points
  const startPoint = points.length > 0 ? points[0] : null
  const endPoint = points.length > 1 ? points[points.length - 1] : null

  // Create marker icons
  const startIcon = useMemo(() => createMarkerIcon("start"), [])
  const endIcon = useMemo(() => createMarkerIcon(isLive ? "current" : "end"), [isLive])

  if (points.length === 0) {
    return (
      <div className="h-64 bg-slate-100 rounded-xl flex items-center justify-center">
        <p className="text-sm text-slate-500">No route data available</p>
      </div>
    )
  }

  // Calculate center from bounds
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

        {/* Route polyline */}
        <Polyline
          positions={polylinePositions}
          pathOptions={{
            color: "#64748b",
            weight: 4,
            opacity: 0.8,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        {/* Gradient overlay for route direction */}
        <Polyline
          positions={polylinePositions}
          pathOptions={{
            color: "#94a3b8",
            weight: 2,
            opacity: 0.5,
            dashArray: "10, 10",
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
            <span className="w-6 h-0.5 bg-slate-500 rounded" />
            <span>Route</span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {points.length} GPS points recorded
        </p>
      </div>
    </div>
  )
}
