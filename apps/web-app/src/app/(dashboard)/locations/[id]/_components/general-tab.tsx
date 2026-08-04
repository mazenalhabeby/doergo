"use client"

import { useState, useRef } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, CheckCircle2, Loader2, MapPin, PauseCircle } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation, type UpdateLocationInput } from "@/lib/api"
import { ATTENDANCE_CONSTANTS } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuditTrail } from "@/components/audit-trail"
import { TimezoneCombobox, fetchTimezone } from "@/components/timezone-combobox"

const { MIN_GEOFENCE_RADIUS: GEO_MIN, MAX_GEOFENCE_RADIUS: GEO_MAX, DEFAULT_GEOFENCE_RADIUS: GEO_DEFAULT } =
  ATTENDANCE_CONSTANTS

// The same map picker used by the New-Space form — reused so the address
// experience is identical (DRY). Dynamic-imported because Leaflet needs `window`.
const LocationPicker = dynamic(() => import("../../_components/location-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
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
    <div className="max-w-3xl space-y-5">
      {/* ── Space details ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-[18px] w-[18px]" />
            </span>
            <div>
              <CardTitle className="text-base">{t("locations.detailsSection")}</CardTitle>
              <CardDescription>{t("locations.detailsHint")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-name">{t("locations.name")}</Label>
            <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("locations.name")} />
          </div>
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{t("locations.activeLabel")}</p>
                {isActive ? (
                  <Badge className="gap-1 border-transparent bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("common.active")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 text-muted-foreground">
                    <PauseCircle className="h-3 w-3" />
                    {t("common.inactive")}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t("locations.activeHint")}</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </CardContent>
      </Card>

      {/* ── Location & timezone ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300">
              <MapPin className="h-[18px] w-[18px]" />
            </span>
            <div>
              <CardTitle className="text-base">{t("locations.locationSection")}</CardTitle>
              <CardDescription>{t("locations.locationHint")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Always show the map — it's how you SET a space's location (and its
              timezone auto-fills). Logical spaces can simply leave it empty. */}
          <LocationPicker
            lat={lat}
            lng={lng}
            radius={clampRadius()}
            address={address}
            onLocationChange={handleLocationChange}
            onAddressChange={setAddress}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-radius">{t("locations.geofenceRadius")}</Label>
              <div className="relative w-40">
                <Input
                  id="cfg-radius"
                  type="number"
                  min={GEO_MIN}
                  max={GEO_MAX}
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  className="pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  m
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-timezone">{t("locations.timezone")}</Label>
              <TimezoneCombobox value={timezone} onChange={setTimezone} />
              <p className="text-[11px] text-muted-foreground/70">{t("locations.timezoneAutoHint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Save ── */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending} className="min-w-[120px]">
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("common.saving")}
            </>
          ) : (
            t("common.save")
          )}
        </Button>
      </div>

      {/* Full accountability audit trail — managers only (self-gated). */}
      <AuditTrail resourceType="locations" resourceId={space.id} />
    </div>
  )
}
