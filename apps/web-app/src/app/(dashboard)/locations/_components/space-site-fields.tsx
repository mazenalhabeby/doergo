"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { LatLng } from "@hbcfield/shared/client"
import {
  ATTENDANCE_CONSTANTS,
  RADIUS_SLIDER_STEPS,
  radiusToSliderPosition,
  sliderPositionToRadius,
} from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Input, Label } from "@/components/ui"
import { TimezoneCombobox } from "@/components/common/timezone-combobox"

export const {
  MIN_GEOFENCE_RADIUS: GEO_MIN,
  MAX_GEOFENCE_RADIUS: GEO_MAX,
  DEFAULT_GEOFENCE_RADIUS: GEO_DEFAULT,
} = ATTENDANCE_CONSTANTS

const LocationPicker = dynamic(() => import("@/components/map/location-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

/** A physical site's address, map pin or drawn boundary, timezone and geofence radius. Renders nothing for a workspace. */
export function SpaceSiteFields({
  isPhysical,
  address,
  setAddress,
  polygon,
  setPolygon,
  lat,
  lng,
  radius,
  setRadius,
  handleLocationChange,
  timezone,
  setTimezone,
}: {
  isPhysical: boolean
  address: string
  setAddress: (v: string) => void
  polygon: LatLng[] | null
  setPolygon: (v: LatLng[] | null) => void
  lat: number | null
  lng: number | null
  radius: string
  setRadius: (v: string) => void
  handleLocationChange: (lat: number, lng: number) => void
  timezone: string
  setTimezone: (v: string) => void
}) {
  const { t } = useTranslation()
  /** A drawn boundary supersedes the radius — the check never reads it. */
  const hasBoundary = (polygon?.length ?? 0) >= 3
  return (
    <>
      {isPhysical && (
        <div data-tour="spaces-form-physical" className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="space-y-2">
            <Label htmlFor="space-address">{t("locations.address")}</Label>
            <Input
              id="space-address"
              placeholder={t("locations.form.addressPlaceholder")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <LocationPicker
            polygon={polygon}
            onPolygonChange={setPolygon}
            lat={lat}
            lng={lng}
            radius={parseInt(radius) || GEO_DEFAULT}
            address={address}
            onLocationChange={handleLocationChange}
            onAddressChange={setAddress}
          />
          {/* Timezone only matters for a PHYSICAL space (has a pin). A logical
            space anchors shifts to each worker's own clock-in timezone, so
            there's nothing to set here. */}
          {lat != null && lng != null && (
            <div className="space-y-2">
              <Label htmlFor="space-timezone">{t("locations.timezone")}</Label>
              <TimezoneCombobox value={timezone} onChange={setTimezone} />
              <p className="text-xs text-muted-foreground">{t("locations.timezoneAutoHint")}</p>
            </div>
          )}
          {/*
          A drawn boundary REPLACES this — `isAtSite` checks the shape and
          never reads the radius. Left visible but inert rather than hidden:
          the value survives clearing the boundary, and a control that
          disappears is its own kind of confusing.
        */}
          <div className="space-y-2">
            <Label htmlFor="space-radius" className={hasBoundary ? "text-muted-foreground" : undefined}>
              {t("locations.form.geofenceRadius")}
            </Label>
            <div className={cn("flex items-center gap-3", hasBoundary && "opacity-50")}>
              <Input
                id="space-radius"
                type="number"
                min={GEO_MIN}
                max={GEO_MAX}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                disabled={hasBoundary}
                className="w-24"
              />
              <input
                type="range"
                min={0}
                max={RADIUS_SLIDER_STEPS}
                value={radiusToSliderPosition(parseInt(radius) || GEO_DEFAULT)}
                onChange={(e) => setRadius(String(sliderPositionToRadius(parseInt(e.target.value))))}
                disabled={hasBoundary}
                className="flex-1 accent-blue-600"
              />
              <span className="text-sm text-muted-foreground w-12 text-right">{radius}m</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {hasBoundary
                ? t(
                    "locations.boundary.radiusSuperseded",
                    "The drawn site is used instead. Clear it to go back to a radius.",
                  )
                : t("locations.form.geofenceHint")}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
