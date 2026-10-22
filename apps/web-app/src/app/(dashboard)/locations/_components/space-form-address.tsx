"use client"

import { RADIUS_SLIDER_STEPS, radiusToSliderPosition, sliderPositionToRadius } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Input, Label } from "@/components/ui"
import { TimezoneCombobox } from "@/components/common/timezone-combobox"
import { GEO_MIN, GEO_MAX, GEO_DEFAULT } from "./use-space-form"
import { LocationPicker } from "./space-form-helpers"
import type { SpaceFormState } from "./use-space-form"

/** Part of SpaceForm's markup, moved here unchanged; it reads the page's state from `vm`. */
export function SpaceFormAddress({ vm }: { vm: SpaceFormState }) {
  const {
    isPhysical,
    t,
    address,
    setAddress,
    polygon,
    setPolygon,
    lat,
    lng,
    radius,
    handleLocationChange,
    timezone,
    setTimezone,
    hasBoundary,
    setRadius,
  } = vm
  return (
    <>{isPhysical && (
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
    )}</>
  )
}
