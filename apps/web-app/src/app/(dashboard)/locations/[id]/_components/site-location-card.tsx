"use client"

import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { Loader2, MapPin } from "lucide-react"
import { ATTENDANCE_CONSTANTS, type LatLng } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TimezoneCombobox } from "@/components/common/timezone-combobox"

const {
  MIN_GEOFENCE_RADIUS: GEO_MIN,
  MAX_GEOFENCE_RADIUS: GEO_MAX,
  DEFAULT_GEOFENCE_RADIUS: GEO_DEFAULT,
} = ATTENDANCE_CONSTANTS

/** The radius as typed, held inside the range the server accepts. */
export const clampRadius = (radius: string) => Math.min(GEO_MAX, Math.max(GEO_MIN, parseInt(radius) || GEO_DEFAULT))

// The same map picker used by the New-Space form — reused so the address
// experience is identical (DRY). Dynamic-imported because Leaflet needs `window`.
const LocationPicker = dynamic(() => import("@/components/map/location-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

/** A physical site's address, pin or drawn boundary, radius and timezone; a workspace only says it has none. */
export function SiteLocationCard({
  isPhysical,
  address,
  setAddress,
  polygon,
  setPolygon,
  lat,
  lng,
  handleLocationChange,
  radius,
  setRadius,
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
  handleLocationChange: (lat: number, lng: number) => void
  radius: string
  setRadius: (v: string) => void
  timezone: string
  setTimezone: (v: string) => void
}) {
  const { t } = useTranslation()
  /** A drawn boundary supersedes the radius — see the note by the field. */
  const hasBoundary = (polygon?.length ?? 0) >= 3
  return (
    <Card className="rounded-[22px] shadow-shell">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span
            className={
              "flex size-9 shrink-0 items-center justify-center rounded-lg bg-shell-accent-soft " + "text-shell-accent"
            }
          >
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
              radius={clampRadius(radius)}
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
              "No fixed location — attendance uses each worker's own timezone. Add a " +
                "location to set a fixed site timezone and geofence.",
            )}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
