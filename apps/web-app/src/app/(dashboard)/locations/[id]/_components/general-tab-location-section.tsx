"use client"

import { MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TimezoneCombobox } from "@/components/timezone-combobox"
import { GEO_MIN, GEO_MAX } from "./use-general-tab"
import { LocationPicker } from "./general-tab-helpers"
import type { GeneralTabState } from "./use-general-tab"

/** Part of GeneralTab's markup, moved here unchanged; it reads the page's state from `vm`. */
export function GeneralTabLocationSection({ vm }: { vm: GeneralTabState }) {
  const {
    t,
    isPhysical,
    address,
    setAddress,
    polygon,
    setPolygon,
    lat,
    lng,
    clampRadius,
    handleLocationChange,
    hasBoundary,
    radius,
    setRadius,
    timezone,
    setTimezone,
  } = vm
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span
            className={"flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 " +
              "text-sky-600 dark:bg-sky-950 dark:text-sky-300"}>
            <MapPin className="h-[18px] w-[18px]" />
          </span>
          <div>
            <CardTitle className="text-base">{t("locations.locationSection")}</CardTitle>
            <CardDescription>
              {isPhysical ? t("locations.locationHint") : t("locations.timezoneOnlyHint")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Physical sites get the map + geofence; workspaces just pick a
            timezone (used to display attendance/task times). */}
        {isPhysical && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-address">{t("locations.address")}</Label>
              <Input
                id="cfg-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("locations.form.addressPlaceholder")}
              />
            </div>
            <LocationPicker
              polygon={polygon}
              onPolygonChange={setPolygon}
              lat={lat}
              lng={lng}
              radius={clampRadius()}
              address={address}
              onLocationChange={handleLocationChange}
              onAddressChange={setAddress}
            />
          </>
        )}

        {isPhysical ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-radius" className={hasBoundary ? "text-muted-foreground" : undefined}>
                {t("locations.geofenceRadius")}
              </Label>
              {/*
                A drawn boundary REPLACES the radius — `isAtSite` checks the
                shape and never looks at this number. Leaving the field live
                offers a control that silently does nothing, which is how
                somebody spends an afternoon adjusting a radius that was never
                being read. Disabled and explained, rather than hidden: a
                control that vanishes is its own kind of confusing, and the
                value is still there when the boundary is cleared.
              */}
              <div className="relative w-40">
                <Input
                  id="cfg-radius"
                  type="number"
                  min={GEO_MIN}
                  max={GEO_MAX}
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  disabled={hasBoundary}
                  className="pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  m
                </span>
              </div>
              {hasBoundary && (
                <p className="text-[11px] leading-snug text-muted-foreground/80">
                  {t(
                    "locations.boundary.radiusSuperseded",
                    "The drawn site is used instead. Clear it to go back to a radius.",
                  )}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-timezone">{t("locations.timezone")}</Label>
              <TimezoneCombobox value={timezone} onChange={setTimezone} />
              <p className="text-[11px] text-muted-foreground/70">{t("locations.timezoneAutoHint")}</p>
            </div>
          </div>
        ) : (
          // Logical space: no timezone to set — shifts use each worker's own
          // clock-in timezone. Pin it on the map (make it physical) to fix a
          // site timezone + geofence.
          <p className="text-sm text-muted-foreground">
            {t(
              "locations.logicalNoTimezone",
              ("No fixed location — attendance uses each worker's own timezone. Add a " +
                "location to set a fixed site timezone and geofence."))}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
