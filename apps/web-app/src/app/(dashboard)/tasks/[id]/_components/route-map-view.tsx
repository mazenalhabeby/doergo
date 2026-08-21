"use client"

import { useMemo } from "react"
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION } from "@/lib/map-tiles"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
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
  /**
   * Road-snapped path from the server, when route matching is configured.
   *
   * The browser used to do this itself, sending up to a hundred of an
   * employee's coordinates and their timestamps to a public OSRM demo server —
   * once per viewer, to a third party with no agreement covering it. It is
   * computed server-side now, so nothing leaves this app; absent, the raw GPS
   * trace is drawn, which is what the old code fell back to anyway.
   */
  matchedPath?: [number, number][] | null
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

export default function RouteMapView({ points, matchedPath, isLive = false }: RouteMapViewProps) {
  const { t } = useTranslation()
  const { formatTime } = useTimeFormat()

  // Raw GPS polyline — what the device actually recorded.
  const rawPositions = useMemo(() => {
    return points.map((p) => [p.lat, p.lng] as [number, number])
  }, [points])

  // The snapped path arrives with the route; no request, no waiting, no spinner.
  const displayPath = matchedPath?.length ? matchedPath : rawPositions

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
      <div className="h-64 bg-muted rounded-xl flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("tasks.route.noRouteData")}</p>
      </div>
    )
  }

  const center = bounds ? bounds.getCenter() : { lat: points[0].lat, lng: points[0].lng }

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ height: "320px", width: "100%" }}
        scrollWheelZoom={false}
        bounds={bounds || undefined}
        boundsOptions={{ padding: [50, 50] }}
        attributionControl
      >
        <TileLayer
          url={MAP_TILE_URL}
            attribution={MAP_TILE_ATTRIBUTION}
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
                <p className="font-semibold text-foreground">{t("tasks.route.startPoint")}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                  <Clock size={12} />
                  {formatTime(startPoint.timestamp)}
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
                <p className="font-semibold text-foreground">
                  {isLive ? t("tasks.route.currentLocation") : t("tasks.route.destination")}
                </p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                  <Clock size={12} />
                  {formatTime(endPoint.timestamp)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Map legend */}
      <div className="px-4 py-3 bg-muted border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-green-500" />
            <span>{t("tasks.route.start")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`size-3 rounded-full ${isLive ? "bg-amber-500" : "bg-blue-500"}`} />
            <span>{isLive ? t("tasks.route.current") : t("tasks.route.end")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-0.5 bg-blue-600 rounded" />
            <span>{t("tasks.route.route")}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("tasks.route.gpsPointsCount", { count: points.length })}
        </p>
      </div>
    </div>
  )
}
