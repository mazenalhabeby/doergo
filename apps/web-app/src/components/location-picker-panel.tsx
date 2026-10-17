"use client"

import { MapContainer, Marker, Circle, Polygon } from "react-leaflet"
import L from "leaflet"
import { Loader2, LocateFixed, Spline, Undo2, Trash2, Maximize2, Minimize2 } from "lucide-react"
import { BaseTiles } from "@/components/map/base-tiles"
import { cn } from "@/lib/utils"
import { markerIcon } from "@/lib/leaflet-icon"
import { polygonAreaSqm, GEOFENCE_POLYGON_LIMITS } from "@hbcfield/shared/client"
import { InvalidateSizeOn, MapClickHandler, widestSpanMetres, ViewTracker, MapPanner } from "./location-picker-map"
import type { LocationPickerState } from "./use-location-picker"

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
/** The map half of LocationPicker — its markup, moved here unchanged. */
export function LocationPickerPanel({ s }: { s: LocationPickerState }) {
  const {
    lat,
    lng,
    radius,
    onPolygonChange,
    disabled,
    t,
    formatDistance,
    isAddress,
    view,
    canDrawBoundary,
    drawing,
    setDrawing,
    expanded,
    setExpanded,
    viewRef,
    ring,
    locating,
    handleMapClick,
    useMyLocation,
    mapCenter,
  } = s
  return (
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
                !drawing
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground hover:bg-muted",
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
                drawing
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground hover:bg-muted",
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
          title={
            expanded ? t("locations.boundary.collapseMap", "Done") : t("locations.boundary.expandMap", "Bigger map")
          }
          className="absolute bottom-2 left-2 z-[20] flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-card"
        >
          {expanded ? (
            <Minimize2 className="h-3.5 w-3.5 text-blue-600" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5 text-blue-600" />
          )}
          {expanded ? t("locations.boundary.collapseMap", "Done") : t("locations.boundary.expandMap", "Bigger map")}
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
          <ViewTracker
            onChange={(v) => {
              viewRef.current = v
            }}
          />
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
}
