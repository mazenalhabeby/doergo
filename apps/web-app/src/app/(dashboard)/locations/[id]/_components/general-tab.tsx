"use client"

import { useState, useRef } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation, type UpdateLocationInput } from "@/lib/api"
import { ATTENDANCE_CONSTANTS } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuditTrail } from "@/components/audit-trail"
import { TimezoneCombobox, fetchTimezone } from "@/components/timezone-combobox"

const { MIN_GEOFENCE_RADIUS: GEO_MIN, MAX_GEOFENCE_RADIUS: GEO_MAX, DEFAULT_GEOFENCE_RADIUS: GEO_DEFAULT } =
  ATTENDANCE_CONSTANTS

// Same map picker used by the New-Space form — reused here so the address
// experience is identical (DRY). Dynamic-imported because Leaflet needs `window`.
const LocationPicker = dynamic(() => import("../../_components/location-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

export function GeneralTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [name, setName] = useState(space.name)
  const [address, setAddress] = useState(space.address || "")
  const [lat, setLat] = useState<number | null>(space.lat ?? null)
  const [lng, setLng] = useState<number | null>(space.lng ?? null)
  const [radius, setRadius] = useState(space.geofenceRadius.toString())
  const [timezone, setTimezone] = useState(space.timezone || "Europe/Berlin")
  const [isActive, setIsActive] = useState(space.isActive)

  // Physical spaces (those with coordinates) get the map; logical workspaces don't.
  const isPhysical = space.lat != null && space.lng != null
  const clampRadius = () => Math.min(GEO_MAX, Math.max(GEO_MIN, parseInt(radius) || GEO_DEFAULT))

  // Remember the last coords we auto-derived a timezone for, so a save/re-render
  // doesn't refetch and clobber a manual override.
  const lastTzCoords = useRef<string>("")

  const mutation = useMutation({
    mutationFn: (data: UpdateLocationInput) => locationsApi.update(space.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location", space.id] })
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      notify.success(t("locations.toast.updated"))
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.updateFailed")),
  })

  // Dropping a pin / searching updates coords AND auto-fills the timezone from
  // the map (the admin can still override with the searchable picker below).
  const handleLocationChange = (newLat: number, newLng: number) => {
    setLat(newLat)
    setLng(newLng)
    const key = `${newLat.toFixed(4)},${newLng.toFixed(4)}`
    if (key === lastTzCoords.current) return
    lastTzCoords.current = key
    void fetchTimezone(newLat, newLng).then((tz) => {
      if (tz) setTimezone(tz)
    })
  }

  const handleSave = () => {
    if (!name.trim()) return notify.error(t("locations.nameRequired"))
    mutation.mutate({
      name: name.trim(),
      address: address.trim() || undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      geofenceRadius: clampRadius(),
      timezone,
      isActive,
    })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="cfg-name">{t("locations.name")}</Label>
        <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {isPhysical ? (
        // Map-first address: search + drop-a-pin, coords + geofence circle.
        <LocationPicker
          lat={lat}
          lng={lng}
          radius={clampRadius()}
          address={address}
          onLocationChange={handleLocationChange}
          onAddressChange={setAddress}
        />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="cfg-address">{t("locations.address")}</Label>
          <Input id="cfg-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cfg-radius">{t("locations.geofenceRadius")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="cfg-radius"
              type="number"
              min={GEO_MIN}
              max={GEO_MAX}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{radius}m</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cfg-timezone">{t("locations.timezone")}</Label>
          <TimezoneCombobox value={timezone} onChange={setTimezone} />
          {isPhysical && (
            <p className="text-[11px] text-muted-foreground/70">{t("locations.timezoneAutoHint")}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t("locations.activeLabel")}</p>
          <p className="text-xs text-muted-foreground">{t("locations.activeHint")}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending} size="sm">
          {mutation.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>

      {/* Full accountability audit trail — managers only (self-gated). */}
      <AuditTrail resourceType="locations" resourceId={space.id} />
    </div>
  )
}
