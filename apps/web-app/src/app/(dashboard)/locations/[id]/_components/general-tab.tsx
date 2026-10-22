"use client"

import { useState, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, CheckCircle2, Loader2, PauseCircle } from "lucide-react"
import { parseGeofencePolygon, type LatLng } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { locationsApi, type CompanyLocation, type UpdateLocationInput } from "@/lib/api"
import { fetchTimezone } from "@/components/common/timezone-combobox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuditTrail } from "@/components/common/audit-trail"
import { DangerZone } from "./danger-zone"
import { WorkspaceContentLinks } from "./workspace-content-links"
import { DefaultWorkspaceCard } from "./default-workspace-card"
import { SpaceTypeCard } from "./space-type-card"
import { OwnershipCard } from "./ownership-card"
import { SiteLocationCard, clampRadius } from "./site-location-card"

/** A workspace's General settings: its content links, the default card, details, type, ownership and location. */
export function GeneralTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState(space.name)
  // Type is derived from whether the space has coordinates (same implicit model
  // as the New-Space form — a physical site has a pin, a workspace doesn't).
  const [type, setType] = useState<"workspace" | "physical">(
    space.lat != null && space.lng != null ? "physical" : "workspace",
  )
  const [address, setAddress] = useState(space.address || "")
  const [lat, setLat] = useState<number | null>(space.lat ?? null)
  const [lng, setLng] = useState<number | null>(space.lng ?? null)
  const [radius, setRadius] = useState(space.geofenceRadius.toString())
  // The drawn outline. `parseGeofencePolygon` rather than a cast: the column is
  // JSON and may hold anything an older build or a restored backup left there.
  const [polygon, setPolygon] = useState<LatLng[] | null>(
    parseGeofencePolygon((space as { geofencePolygon?: unknown }).geofencePolygon),
  )
  const [timezone, setTimezone] = useState(space.timezone || "Europe/Berlin")
  // Ownership classification (separate axis from workspace/physical).
  const [kind, setKind] = useState<"PROJECT" | "COMPANY" | "CUSTOMER">(
    (space.kind as "PROJECT" | "COMPANY" | "CUSTOMER") || "COMPANY",
  )
  const [contactName, setContactName] = useState(space.contactName || "")
  const [contactEmail, setContactEmail] = useState(space.contactEmail || "")
  const [contactPhone, setContactPhone] = useState(space.contactPhone || "")

  const isPhysical = type === "physical"

  // Remember the last coords we auto-derived a timezone for, so a save/re-render
  // doesn't refetch and clobber a manual override.
  const lastTzCoords = useRef<string>("")

  const mutation = useMutation({
    mutationFn: (data: UpdateLocationInput) => locationsApi.update(space.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
      queryClient.invalidateQueries({ queryKey: keys.locations.lists() })
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
      timezone,
      // Ownership kind + customer contact fields (cleared when not CUSTOMER).
      kind,
      contactName: kind === "CUSTOMER" ? contactName.trim() || null : null,
      contactEmail: kind === "CUSTOMER" ? contactEmail.trim() || null : null,
      contactPhone: kind === "CUSTOMER" ? contactPhone.trim() || null : null,
      // Rates are not part of this Save — each has its own dated Change (below).
      // Physical → persist the pin/address/geofence. Workspace → clear the
      // physical attributes (null) so the space becomes a logical one.
      ...(isPhysical
        ? {
            address: address.trim() || undefined,
            lat: lat ?? undefined,
            lng: lng ?? undefined,
            geofenceRadius: clampRadius(radius),
            // Sent on every physical save so clearing a boundary persists;
            // `null` returns the site to its radius.
            geofencePolygon: polygon,
          }
        : { address: null, lat: null, lng: null, geofencePolygon: null }),
    })
  }

  return (
    <div className="max-w-3xl space-y-5">
      <WorkspaceContentLinks space={space} />

      {/*
        Which workspace catches work that belongs to no particular one.

        The flag was set when the first space was created and could never move,
        so an organization whose first space turned out to be the wrong one was
        stuck — and the Danger zone refused to delete it with "make another
        space the default first", which nothing in the product could do.

        Here rather than in the Danger zone: choosing where unassigned work
        lands is an ordinary setting. It is the REFUSAL to delete that is
        dangerous, and that message now points at this card.
      */}
      <DefaultWorkspaceCard space={space} />

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
            <Input
              id="cfg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("locations.name")}
            />
          </div>
          {/* Read-only status — archiving/restoring is done in the Danger zone below. */}
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{t("locations.activeLabel")}</p>
                {space.isActive ? (
                  <Badge
                    className={
                      "gap-1 border-transparent bg-green-100 text-green-700 hover:bg-green-100 " +
                      "dark:bg-green-950 dark:text-green-300"
                    }
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {t("common.active")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 text-muted-foreground">
                    <PauseCircle className="h-3 w-3" />
                    {t("locations.archived", "Archived")}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t("locations.activeHint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Space type ── */}
      <SpaceTypeCard isPhysical={isPhysical} setType={setType} />

      {/* ── Ownership (project / my company / customer company) ── */}
      <OwnershipCard
        space={space}
        kind={kind}
        setKind={setKind}
        contactName={contactName}
        setContactName={setContactName}
        contactEmail={contactEmail}
        setContactEmail={setContactEmail}
        contactPhone={contactPhone}
        setContactPhone={setContactPhone}
      />

      {/* ── Location & timezone ── */}
      <SiteLocationCard
        isPhysical={isPhysical}
        address={address}
        setAddress={setAddress}
        polygon={polygon}
        setPolygon={setPolygon}
        lat={lat}
        lng={lng}
        handleLocationChange={handleLocationChange}
        radius={radius}
        setRadius={setRadius}
        timezone={timezone}
        setTimezone={setTimezone}
      />

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

      {/* Danger zone — delete (archive) this space. */}
      <DangerZone space={space} />
    </div>
  )
}
