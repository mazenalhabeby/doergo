"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { BaseTiles } from "@/components/map/base-tiles"
import { MapContainer, Marker, Circle, Polygon, useMapEvents, useMap } from "react-leaflet"
import L from "leaflet"
import { Search, Loader2, MapPin, Keyboard, LocateFixed, Spline, Undo2, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { formatNominatimAddress, formatPhotonFeature, type PhotonProperties, type NominatimAddress } from "@/lib/geocode"
import { polygonAreaSqm, GEOFENCE_POLYGON_LIMITS, type LatLng } from "@hbcfield/shared/client"

import "leaflet/dist/leaflet.css"

/** --brand-600. Leaflet draws on canvas, so it needs a resolved colour. */
const BRAND_ACCENT = "#2563eb"
/** --ok / emerald-600. Distinct from the radius circle so the two are never
 *  confused while switching between them. Leaflet paints on a canvas and
 *  cannot read a CSS variable, so this is resolved rather than tokenised. */
const BOUNDARY_ACCENT = "#16a34a"

/** A small square handle — visibly a control, unlike the address pin. */
const vertexIcon = L.divIcon({
  className: "",
  html:
    '<div style="width:12px;height:12px;border-radius:3px;background:#16a34a;' +
    'border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:move"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

// Fix Leaflet default marker icon
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface GeoResult {
  display_name: string
  lat: string
  lon: string
  // Google placeId — when set, coordinates are resolved on selection via
  // /geo/place (session-token pattern). Empty for fallback rows that already
  // carry lat/lon.
  place_id?: string
}

interface LocationPickerProps {
  lat: number | null
  lng: number | null
  radius: number
  address: string
  onLocationChange: (lat: number, lng: number) => void
  onAddressChange: (address: string) => void
  /**
   * The drawn site boundary. When present it REPLACES the radius, because an
   * address geocodes to the front door and a circle measured from there cannot
   * describe a property with a yard or several buildings.
   *
   * Optional: callers that only need a pin (and every existing caller) pass
   * neither, and the boundary UI does not appear at all.
   */
  polygon?: LatLng[] | null
  onPolygonChange?: (ring: LatLng[] | null) => void
}

/** The two upstream geocoders, as much of them as this file reads. */
interface PhotonFeature {
  properties?: PhotonProperties
  geometry: { coordinates: [number, number] }
}

interface NominatimResult {
  address?: NominatimAddress
  display_name?: string
  lat: string
  lon: string
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/** Metres across the widest part of a ring — the number that tells an admin
 *  at a glance whether they have drawn the property or the neighbourhood. */
function widestSpanMetres(ring: LatLng[]): number {
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

function MapPanner({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15))
  }, [map, lat, lng])
  return null
}

export default function LocationPicker({
  lat,
  lng,
  radius,
  address,
  onLocationChange,
  onAddressChange,
  polygon,
  onPolygonChange,
}: LocationPickerProps) {
  const { t } = useTranslation()
  // Boundary editing is only offered when the caller wired the handler, so the
  // picker keeps working unchanged everywhere it is used for a pin alone.
  const canDrawBoundary = typeof onPolygonChange === "function"
  const [drawing, setDrawing] = useState(false)
  const ring = polygon ?? []
  const [searchQuery, setSearchQuery] = useState("")
  const [results, setResults] = useState<GeoResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [manualLat, setManualLat] = useState(lat?.toString() || "")
  const [manualLng, setManualLng] = useState(lng?.toString() || "")
  const [locating, setLocating] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  // Google Places session token: groups the as-you-type autocomplete calls with
  // the one Place Details call on selection, so the whole search bills as a
  // single (cheap) session. Reset after each selection.
  const sessionRef = useRef<string>("")

  // Sync manual inputs when lat/lng change from map click or search
  useEffect(() => {
    if (lat !== null) setManualLat(lat.toFixed(6))
    if (lng !== null) setManualLng(lng.toFixed(6))
  }, [lat, lng])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Search using both Photon and Nominatim for wider coverage
  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      // Primary: our self-hosted Photon (full-planet) via the gateway — no public
      // rate limits, no exposed key. Falls back to the public geocoders below if it
      // returns nothing (e.g. before the index finished loading, or a coverage gap).
      try {
        const geoBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1"
        // One session token per search; reused across keystrokes until a pick.
        if (!sessionRef.current && typeof crypto !== "undefined" && crypto.randomUUID) {
          sessionRef.current = crypto.randomUUID()
        }
        const sess = sessionRef.current ? `&session=${encodeURIComponent(sessionRef.current)}` : ""
        const gr = await fetch(`${geoBase}/geo/search?q=${encodeURIComponent(query)}&limit=6${sess}`, { signal: AbortSignal.timeout(5000) })
        if (gr.ok) {
          const gd = await gr.json()
          const geoResults: GeoResult[] = (gd?.results || []).map(
            (r: { id?: string; label: string; lat?: number; lon?: number }) => ({
              display_name: r.label,
              lat: r.lat != null ? String(r.lat) : "",
              lon: r.lon != null ? String(r.lon) : "",
              place_id: r.id || undefined,
            })
          )
          if (geoResults.length > 0) {
            setResults(geoResults.slice(0, 5))
            setShowResults(true)
            return
          }
        }
      } catch {
        /* handled below as "nothing found" */
      }

      /*
        No public fallback.

        This used to fetch photon.komoot.io and nominatim.openstreetmap.org
        straight from the browser when /geo came back empty — sending the
        customer's IP and the address they were typing to two services the
        business has no agreement with. Nominatim's policy caps callers at one
        request a second behind an identifying User-Agent; a browser can set
        neither, and every user's device counted as its own caller.

        The chain behind /geo is Google then our own Photon. Both empty is a
        real "no results", and the answer to a coverage gap is the Photon index,
        not a public API that throttles precisely when it is being leaned on.
      */
      setResults([])
      setShowResults(false)
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchAddress(value), 400)
  }

  const selectResult = async (result: GeoResult) => {
    setShowResults(false)
    setResults([])
    setSearchQuery("")

    // Google row: resolve coordinates now (this closes the billed session).
    if (result.place_id) {
      try {
        const geoBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1"
        const sess = sessionRef.current ? `&session=${encodeURIComponent(sessionRef.current)}` : ""
        const res = await fetch(
          `${geoBase}/geo/place?id=${encodeURIComponent(result.place_id)}${sess}`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (res.ok) {
          const data = await res.json()
          const r = data?.result
          if (r && typeof r.lat === "number" && typeof r.lon === "number") {
            onLocationChange(r.lat, r.lon)
            onAddressChange(r.label || result.display_name)
            sessionRef.current = "" // fresh token for the next search
            return
          }
        }
      } catch {
        /* fall through to whatever coords the row carried */
      } finally {
        sessionRef.current = ""
      }
    }

    // Fallback row (Photon/Nominatim) already carries coordinates.
    const newLat = parseFloat(result.lat)
    const newLng = parseFloat(result.lon)
    if (!Number.isNaN(newLat) && !Number.isNaN(newLng)) {
      onLocationChange(newLat, newLng)
      onAddressChange(result.display_name)
    }
  }

  const handleMapClick = useCallback(
    async (clickLat: number, clickLng: number) => {
      // While drawing, a click is a corner of the site — not a new pin. Sharing
      // one handler keeps the map's own click wiring in one place.
      if (drawing && onPolygonChange) {
        if (ring.length >= GEOFENCE_POLYGON_LIMITS.MAX_POINTS) {
          notify.error(
            t("locations.boundary.tooManyPoints", "A boundary can have at most {{max}} points.", {
              max: GEOFENCE_POLYGON_LIMITS.MAX_POINTS,
            }),
          )
          return
        }
        onPolygonChange([...ring, { lat: clickLat, lng: clickLng }])
        return
      }
      onLocationChange(clickLat, clickLng)
      // Reverse geocode: prefer the server-side /geo/reverse proxy (no public
      // rate limits); fall back to Nominatim (zoom=18 for building-level detail).
      try {
        let formatted = ""
        try {
          const geoBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1"
          const gr = await fetch(`${geoBase}/geo/reverse?lat=${clickLat}&lon=${clickLng}`, {
            signal: AbortSignal.timeout(5000),
          })
          if (gr.ok) formatted = (await gr.json())?.result?.label || ""
        } catch {
          /* the click still records its coordinates; only the label is missing */
        }
        // Only auto-fill when the field is empty — never clobber an address the
        // user typed/pasted (e.g. a precise house number OSM search can't find).
        if (formatted && !address.trim()) {
          onAddressChange(formatted)
        }
      } catch {
        // Ignore
      }
    },
    [onLocationChange, onAddressChange, address, drawing, onPolygonChange, ring, t]
  )

  // Use the browser's geolocation, then drop the pin + reverse-geocode (reusing
  // the same flow as a map click). Requires HTTPS + user permission.
  const useMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      notify.error(t("locations.picker.notSupported"))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        handleMapClick(pos.coords.latitude, pos.coords.longitude)
      },
      (err) => {
        setLocating(false)
        notify.error(
          err.code === err.PERMISSION_DENIED
            ? t("locations.picker.permissionDenied")
            : t("locations.picker.locationFailed"),
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }, [handleMapClick])

  const applyManualCoords = (newLat: string, newLng: string) => {
    const latNum = parseFloat(newLat)
    const lngNum = parseFloat(newLng)
    if (!isNaN(latNum) && !isNaN(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180) {
      onLocationChange(latNum, lngNum)
    }
  }

  const handleLatChange = (value: string) => {
    setManualLat(value)
    applyManualCoords(value, manualLng)
  }

  const handleLngChange = (value: string) => {
    setManualLng(value)
    applyManualCoords(manualLat, value)
  }

  const mapCenter: [number, number] = lat && lng ? [lat, lng] : [48.1351, 11.582]

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div ref={wrapperRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("locations.picker.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            className="pl-9 pr-9"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          )}
        </div>

        {showResults && results.length > 0 && (
          <div className="absolute z-[20] mt-1 w-full rounded-lg border bg-card shadow-lg max-h-48 overflow-y-auto">
            {results.map((result, i) => (
              <button
                key={i}
                onClick={() => selectResult(result)}
                className="flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-accent transition-colors border-b last:border-b-0"
              >
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-sm text-foreground line-clamp-2">{result.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/*
        The mode switch. A site with a yard or several buildings cannot be
        described by a circle measured from its front door, so the admin draws
        the property instead. Drawing is opt-in per site; a site with no
        boundary behaves exactly as it always has.
      */}
      {canDrawBoundary && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex">
            <button
              type="button"
              onClick={() => setDrawing(false)}
              aria-pressed={!drawing}
              className={cn(
                "rounded-l-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors",
                !drawing ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {t("locations.boundary.modeRadius", "Radius")}
            </button>
            <button
              type="button"
              onClick={() => setDrawing(true)}
              aria-pressed={drawing}
              className={cn(
                "flex items-center gap-1.5 rounded-r-lg border border-l-0 border-border px-3 py-1.5 text-xs font-medium transition-colors",
                drawing ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <Spline className="h-3.5 w-3.5" />
              {t("locations.boundary.modeDraw", "Draw the site")}
            </button>
          </div>

          {drawing && (
            <>
              <button
                type="button"
                onClick={() => onPolygonChange?.(ring.slice(0, -1))}
                disabled={ring.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" />
                {t("locations.boundary.undo", "Undo point")}
              </button>
              <button
                type="button"
                onClick={() => onPolygonChange?.(null)}
                disabled={ring.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("locations.boundary.clear", "Clear")}
              </button>
            </>
          )}

          {/*
            The numbers that make a mistake obvious BEFORE it is saved: a
            boundary accidentally drawn around the whole street reads as
            hectares and hundreds of metres, and the server refuses it anyway.
          */}
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {ring.length === 0
              ? drawing
                ? t("locations.boundary.hintEmpty", "Click each corner of the site")
                : t("locations.boundary.usingRadius", "Using the radius")
              : ring.length < GEOFENCE_POLYGON_LIMITS.MIN_POINTS
                ? t("locations.boundary.needMore", "{{count}} of 3 points", { count: ring.length })
                : (() => {
                    const area = polygonAreaSqm(ring)
                    const tooBig = area > GEOFENCE_POLYGON_LIMITS.MAX_AREA_SQM
                    return (
                      <span className={tooBig ? "font-medium text-destructive" : undefined}>
                        {t("locations.boundary.summary", "{{points}} points · {{ha}} ha · {{span}} m across", {
                          points: ring.length,
                          ha: (area / 10_000).toFixed(2),
                          span: Math.round(widestSpanMetres(ring)),
                        })}
                        {tooBig ? ` — ${t("locations.boundary.tooLarge", "too large to save")}` : ""}
                      </span>
                    )
                  })()}
          </span>
        </div>
      )}

      {/* Map */}
      <div className="relative rounded-lg overflow-hidden border border-border" style={{ height: 280 }}>
        {/* Locate-me button overlaid on the map */}
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          title={t("locations.picker.useMyLocation")}
          className="absolute right-2 top-2 z-[20] flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-card disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5 text-blue-600" />
          )}
          {locating ? t("locations.picker.locating") : t("locations.picker.myLocation")}
        </button>
        <MapContainer
          center={mapCenter}
          zoom={lat && lng ? 16 : 12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
          attributionControl={false}
        >
          <BaseTiles />
          <MapClickHandler onClick={handleMapClick} />
          {lat && lng && (
            <>
              <MapPanner lat={lat} lng={lng} />
              <Marker position={[lat, lng]} icon={markerIcon} />
              {/* The circle is hidden once a boundary exists: showing both
                  would draw two different answers to the same question. */}
              {ring.length < 3 && (
              <Circle
                center={[lat, lng]}
                radius={radius}
                pathOptions={{
                  // Brand accent, not a literal — the brand moved emerald → blue and
                  // this circle was left behind (audit S-F1). Leaflet paints on a
                  // canvas and cannot read a CSS variable, so the token is resolved
                  // to a value here rather than passed as `var(--brand-600)`.
                  color: BRAND_ACCENT,
                  fillColor: BRAND_ACCENT,
                  fillOpacity: 0.15,
                  weight: 2,
                }}
              />
              )}
            </>
          )}

          {/* The drawn boundary, and a handle on every corner. */}
          {ring.length >= 2 && (
            <Polygon
              positions={ring.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: BOUNDARY_ACCENT,
                fillColor: BOUNDARY_ACCENT,
                fillOpacity: 0.15,
                weight: 2,
              }}
            />
          )}
          {onPolygonChange &&
            ring.map((point, i) => (
              <Marker
                key={i}
                position={[point.lat, point.lng]}
                icon={vertexIcon}
                draggable
                eventHandlers={{
                  dragend(e) {
                    const { lat: nlat, lng: nlng } = (e.target as L.Marker).getLatLng()
                    const next = [...ring]
                    next[i] = { lat: nlat, lng: nlng }
                    onPolygonChange(next)
                  },
                  // A corner in the wrong place is far more common than a
                  // corner too few, so click-to-remove is on the handle itself.
                  click() {
                    onPolygonChange(ring.filter((_, j) => j !== i))
                  },
                }}
              />
            ))}
        </MapContainer>
      </div>

      {/* Address + Coordinates - manual entry */}
      <div className="space-y-3 rounded-lg border border-border bg-muted p-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("locations.picker.address")}</Label>
          <Input
            placeholder={t("locations.picker.addressPlaceholder")}
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            className="bg-card text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("locations.picker.latitude")}</Label>
            <Input
              type="number"
              step="any"
              placeholder="48.1351"
              value={manualLat}
              onChange={(e) => handleLatChange(e.target.value)}
              className="bg-card text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("locations.picker.longitude")}</Label>
            <Input
              type="number"
              step="any"
              placeholder="11.5820"
              value={manualLng}
              onChange={(e) => handleLngChange(e.target.value)}
              className="bg-card text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("locations.picker.hint")}
        </p>
      </div>
    </div>
  )
}
