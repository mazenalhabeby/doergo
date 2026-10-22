"use client"

import { useTranslation } from "react-i18next"
import { Spline, Undo2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFormatDistance } from "@/hooks/use-format-distance"
import { polygonAreaSqm, GEOFENCE_POLYGON_LIMITS, type LatLng } from "@hbcfield/shared/client"
import { widestSpanMetres } from "./location-picker-map"

/**
 * Radius or a drawn boundary, the drawing tools, and the boundary's size. A site with a yard or several
 * buildings cannot be described by a circle measured from its front door, so the admin draws the property.
 */
export function BoundaryToolbar({
  drawing,
  setDrawing,
  setExpanded,
  ring,
  onPolygonChange,
}: {
  drawing: boolean
  setDrawing: (drawing: boolean) => void
  setExpanded: (expanded: boolean) => void
  ring: LatLng[]
  onPolygonChange?: (ring: LatLng[] | null) => void
}) {
  const { t } = useTranslation()
  const formatDistance = useFormatDistance()
  return (
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
            className={
              "flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 " +
              "py-1.5 text-xs font-medium text-muted-foreground transition-colors " +
              "hover:bg-muted disabled:opacity-50"
            }
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t("locations.boundary.undo", "Undo point")}
          </button>
          <button
            type="button"
            onClick={() => onPolygonChange?.(null)}
            disabled={ring.length === 0}
            className={
              "flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 " +
              "py-1.5 text-xs font-medium text-muted-foreground transition-colors " +
              "hover:bg-muted disabled:opacity-50"
            }
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
  )
}
