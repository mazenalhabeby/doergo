"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { BaseTiles } from "@/components/map/base-tiles"
import { MapContainer, Marker, Circle, Polygon, useMapEvents, useMap } from "react-leaflet"
import L from "leaflet"
import { Search, Loader2, MapPin, LocateFixed, Spline, Undo2, Trash2, Maximize2, Minimize2, X, Navigation } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { markerIcon } from "@/lib/leaflet-icon"
import { useAddressSearch, reverseGeocode, type AddressSearchResult } from "@/hooks/use-address-search"
import { useTranslation } from "react-i18next"
import { useFormatDistance } from "@/hooks/use-format-distance"
import { polygonAreaSqm, GEOFENCE_POLYGON_LIMITS, type LatLng } from "@hbcfield/shared/client"

// Leaflet CSS is imported globally (app/globals.css).

/**
 * Leaflet caches the size of its container and only re-reads it when told. Grow
 * the box without saying so and it keeps drawing for the old one: tiles stop
 * halfway across, and — worse while drawing — a click lands at the wrong
 * latitude, because the pixel-to-coordinate maths still uses the small box.
 */
function InvalidateSizeOn({ token }: { token: unknown }) {
  const map = useMap()
  useEffect(() => {
    // After the browser has laid the new box out, not before.
    const frame = requestAnimationFrame(() => map.invalidateSize())
    return () => cancelAnimationFrame(frame)
  }, [map, token])
  return null
}

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

/** Where the map opens: with no pin yet, and its zoom once there is one. */
const VIEW = {
  site: { center: [48.1351, 11.582] as [number, number], emptyZoom: 12, pinnedZoom: 16 },
  address: { center: [52.52, 13.405] as [number, number], emptyZoom: 4, pinnedZoom: 15 },
}

export interface LocationPickerProps {
  lat: number | null
  lng: number | null
  address: string
  onLocationChange: (lat: number, lng: number) => void
  onAddressChange: (address: string) => void
  /**
   * `site` (default): a search box, then the address and the coordinates as
   * fields of their own — for a workspace, an apartment, an asset, a client address.
   * `address`: the search box IS the address, with a clear button and the
   * coordinates as a hint — for a task's destination.
   */
  variant?: "site" | "address"
  /** `address` variant: the clear button emptied the address — drop the pin too. */
  onClear?: () => void
  /** A geofence circle around the pin, in metres. Nothing is drawn without one. */
  radius?: number
  /**
   * The drawn site boundary. When present it REPLACES the radius, because an
   * address geocodes to the front door and a circle measured from there cannot
   * describe a property with a yard or several buildings.
   *
   * Optional: callers that only need a pin pass neither, and the boundary UI
   * does not appear at all.
   */
  polygon?: LatLng[] | null
  onPolygonChange?: (ring: LatLng[] | null) => void
  disabled?: boolean
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

/**
 * Remembers where the map was looking.
 *
 * Opening the map moves it into a dialog, which remounts Leaflet, and a
 * remounted map returns to its initial centre and zoom. Without this, zooming
 * in on a loading bay and then opening the map for a closer look throws that
 * away and starts again from the whole city — the opposite of what was asked
 * for.
 */
function ViewTracker({ onChange }: { onChange: (view: { center: [number, number]; zoom: number }) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter()
      onChange({ center: [c.lat, c.lng], zoom: map.getZoom() })
    },
  })
  return null
}

function MapPanner({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15))
  }, [map, lat, lng])
  return null
}

/** The one location picker: search, pin on a map, and optionally a site's radius or drawn boundary. */
export function LocationPicker({
  lat,
  lng,
  address,
  onLocationChange,
  onAddressChange,
  variant = "site",
  onClear,
  radius,
  polygon,
  onPolygonChange,
  disabled,
}: LocationPickerProps) {
  const { t } = useTranslation()
  const formatDistance = useFormatDistance()
  const isAddress = variant === "address"
  const view = VIEW[variant]
  // Boundary editing is only offered when the caller wired the handler, so the
  // picker keeps working unchanged everywhere it is used for a pin alone.
  const canDrawBoundary = typeof onPolygonChange === "function"
  const [drawing, setDrawing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const viewRef = useRef<{ center: [number, number]; zoom: number } | null>(null)
  const ring = polygon ?? []
  const geo = useAddressSearch({ max: isAddress ? 6 : 5 })
  // `address`: the box shows the address; `site`: the box is only a search.
  const [query, setQuery] = useState(isAddress ? address : "")
  const [manualLat, setManualLat] = useState(lat?.toString() || "")
  const [manualLng, setManualLng] = useState(lng?.toString() || "")
  const [locating, setLocating] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isAddress) setQuery(address)
  }, [isAddress, address])

  // Sync manual inputs when lat/lng change from map click or search
  useEffect(() => {
    if (lat !== null) setManualLat(lat.toFixed(6))
    if (lng !== null) setManualLng(lng.toFixed(6))
  }, [lat, lng])

  const { setShowResults } = geo
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [setShowResults])

  const selectResult = async (row: AddressSearchResult) => {
    if (!isAddress) {
      geo.clear()
      setQuery("")
    }
    const picked = await geo.resolve(row)
    if (!picked) return
    onLocationChange(picked.lat, picked.lng)
    onAddressChange(picked.label)
    if (isAddress) setQuery(picked.label)
  }

  const handleClear = () => {
    setQuery("")
    geo.clear()
    onAddressChange("")
    onClear?.()
  }

  const handleMapClick = useCallback(
    async (clickLat: number, clickLng: number) => {
      if (disabled) return
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
      const formatted = await reverseGeocode(clickLat, clickLng)
      // Only auto-fill when the field is empty — never clobber an address the
      // user typed/pasted (e.g. a precise house number the search can't find).
      if (formatted && !address.trim()) onAddressChange(formatted)
    },
    [disabled, onLocationChange, onAddressChange, address, drawing, onPolygonChange, ring, t]
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
  }, [handleMapClick, t])

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

  const mapCenter: [number, number] = lat && lng ? [lat, lng] : view.center

  /*
    The map takes its own space rather than asking for room.

    280px is fine for dropping a pin on an address you already searched for. It
    is not enough to trace a building: at that size a warehouse is a thumbnail
    and the corners land wherever. So the same panel renders in two places — in
    the form, and in a dialog of its own when opened.

    ⚠️ Three earlier attempts grew it in place, and each failed differently.
    `fixed inset-0` came out 475px wide on a 1728px screen: the create dialog is
    centred with a transform, and a transformed ancestor becomes the containing
    block for its fixed descendants. Sizing to the viewport fixed the width and
    the dialog's `overflow-y-auto` then clipped it, because a scroll container
    clips the fixed descendants it contains. Asking the host to widen worked in
    the dialog and did nothing on the settings page, where a max-width column
    caps it — one control behaving two ways.

    A dialog of its own has none of those ceilings, and Radix already owns the
    stacking, the focus trap and Escape. It renders ONCE either way, so the two
    surfaces cannot drift.
  */
  const mapPanel = (
        <div className={cn(expanded ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2")}>

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
                  onClick={() => {
                  setDrawing(true)
                  setExpanded(true)
                }}
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
                            {t("locations.boundary.summary", "{{points}} points · {{ha}} ha · {{span}} across", {
                              points: ring.length,
                              ha: (area / 10_000).toFixed(2),
                              span: formatDistance(widestSpanMetres(ring)),
                            })}
                            {tooBig ? ` — ${t("locations.boundary.tooLarge", "too large to save")}` : ""}
                          </span>
                        )
                      })()}
              </span>
            </div>
          )}

          {/* Map — its own stacking context so Leaflet's z-indexes don't bleed out */}
          <div
            className={cn(
              "relative overflow-hidden border border-border",
              isAddress ? "rounded-xl" : "rounded-lg",
              expanded && "min-h-0 flex-1",
            )}
            style={expanded ? { isolation: "isolate" } : { height: 280, isolation: "isolate" }}
          >
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              title={expanded
                ? t("locations.boundary.collapseMap", "Done")
                : t("locations.boundary.expandMap", "Bigger map")}
              className="absolute bottom-2 left-2 z-[20] flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-card"
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5 text-blue-600" /> : <Maximize2 className="h-3.5 w-3.5 text-blue-600" />}
              {expanded
                ? t("locations.boundary.collapseMap", "Done")
                : t("locations.boundary.expandMap", "Bigger map")}
            </button>
            {/* Locate-me button overlaid on the map */}
            {!disabled && (
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
            )}
            <MapContainer
              center={viewRef.current?.center ?? mapCenter}
              zoom={viewRef.current?.zoom ?? (lat && lng ? view.pinnedZoom : view.emptyZoom)}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={true}
              attributionControl={false}
            >
              <BaseTiles />
              <InvalidateSizeOn token={expanded} />
              <ViewTracker onChange={(v) => { viewRef.current = v }} />
              <MapClickHandler onClick={handleMapClick} />
              {lat && lng && (
                <>
                  <MapPanner lat={lat} lng={lng} />
                  <Marker position={[lat, lng]} icon={markerIcon} />
                  {/* The circle is hidden once a boundary exists: showing both
                      would draw two different answers to the same question. */}
                  {!!radius && radius > 0 && ring.length < 3 && (
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
        </div>
  )

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div ref={wrapperRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={isAddress ? t("locationPicker.searchPlaceholder") : t("locations.picker.searchPlaceholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              geo.search(e.target.value)
            }}
            onFocus={() => geo.results.length > 0 && geo.setShowResults(true)}
            disabled={disabled}
            className={isAddress
              ? "h-12 pl-10 pr-10 rounded-xl border-border bg-card text-base placeholder:text-muted-foreground focus:border-blue-500 focus:ring-blue-500/20"
              : "pl-9 pr-9"}
          />
          {geo.isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          )}
          {isAddress && !geo.isSearching && query && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {geo.showResults && geo.results.length > 0 && (
          <div
            className={cn(
              "absolute mt-1 w-full border bg-card shadow-lg overflow-hidden",
              isAddress ? "z-[1000] rounded-xl border-border" : "z-[20] rounded-lg max-h-48 overflow-y-auto",
            )}
          >
            {geo.results.map((result, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectResult(result)}
                className={cn(
                  "flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-accent transition-colors",
                  !isAddress && "border-b last:border-b-0",
                )}
              >
                <MapPin className={cn("h-4 w-4 mt-0.5 shrink-0", isAddress ? "text-blue-500" : "text-muted-foreground")} />
                <span className="text-sm text-foreground line-clamp-2">{result.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {expanded ? (
        <Dialog open onOpenChange={(open) => !open && setExpanded(false)}>
          <DialogContent
            className="flex flex-col gap-3 overflow-hidden"
            style={{ width: "95vw", maxWidth: 1400, height: "90dvh" }}
          >
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base">
                {drawing
                  ? t("locations.boundary.modeDraw", "Draw the site")
                  : t("locations.picker.address")}
              </DialogTitle>
              <DialogDescription>
                {drawing
                  ? t("locations.boundary.expandedHintDraw", "Click each corner of the site. Drag a point to move it, click it to remove it.")
                  : t("locations.boundary.expandedHintPin", "Click the map to place the pin.")}
              </DialogDescription>
            </DialogHeader>
            {mapPanel}
          </DialogContent>
        </Dialog>
      ) : (
        mapPanel
      )}

      {isAddress ? (
        lat && lng ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Navigation className="size-3" />
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
        ) : null
      ) : (
        /* Address + Coordinates - manual entry */
        <div className="space-y-3 rounded-lg border border-border bg-muted p-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("locations.picker.address")}</Label>
            <Input
              placeholder={t("locations.picker.addressPlaceholder")}
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              disabled={disabled}
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
                disabled={disabled}
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
                disabled={disabled}
                className="bg-card text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("locations.picker.hint")}
          </p>
        </div>
      )}
    </div>
  )
}

export default LocationPicker
