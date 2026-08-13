"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, Plus, Trash2, Home, UserCheck, Users, ListChecks, Check } from "lucide-react"

import { spacePortalApi, type SpaceUnit } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import { SectionHeader, EmptyState } from "./section-header"

// Same portal-type language as the Clients Portals page (03): badge, entity
// label, blurb, accent — so a space's portal reads identically.
const TEMPLATES = [
  { key: "rental", label: "Rental / Property", badge: "Rental", entity: "Apartment", blurb: "Tenants report maintenance issues (AC, plumbing…).", accent: "emerald" },
  { key: "logistics", label: "Logistics / Delivery", badge: "Logistics", entity: "Order", blurb: "Recipients report delivery problems (not arrived, damaged…).", accent: "orange" },
  { key: "workplace", label: "Workplace / Facilities", badge: "Workplace", entity: "Workspace", blurb: "Employees report facility issues (HVAC, lighting, IT…).", accent: "cyan" },
  { key: "custom", label: "Units (generic)", badge: "Units", entity: "Unit", blurb: "Generic units your clients are tied to.", accent: "slate" },
] as const
const BY_KEY = Object.fromEntries(TEMPLATES.map((x) => [x.key, x]))
const portalInitials = (n?: string) => (n || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?"

const LocationPicker = dynamic(
  () => import("../../_components/location-picker"),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" /> },
) as unknown as React.ComponentType<{
  address: string; lat: number | null; lng: number | null
  onLocationChange: (address: string, lat: number | null, lng: number | null) => void
}>

export function PortalTab({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const portalQ = useQuery({ queryKey: ["space-portal", spaceId], queryFn: () => spacePortalApi.get(spaceId) })
  const unitsQ = useQuery({ queryKey: ["space-units", spaceId], queryFn: () => spacePortalApi.units(spaceId) })
  const portal = portalQ.data
  const meta = BY_KEY[portal?.templateKey || "custom"] ?? BY_KEY.custom
  const entityLabel = portal?.entityLabel || "Unit"
  const units = unitsQ.data ?? []
  const clientCount = units.filter((u: SpaceUnit) => u.customer).length

  const setType = useMutation({
    mutationFn: (templateKey: string) => spacePortalApi.setEntityType(spaceId, templateKey),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["space-portal", spaceId] }); notify.success(t("portal.typeUpdated", "Portal type updated")) },
    onError: (e: any) => notify.error(e.message || "Could not update"),
  })
  const del = useMutation({
    mutationFn: (unitId: string) => spacePortalApi.deleteUnit(spaceId, unitId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["space-units", spaceId] }); notify.success(t("portal.unitRemoved", "Removed")) },
  })
  const invalidateUnits = () => qc.invalidateQueries({ queryKey: ["space-units", spaceId] })

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Building2}
        accent="violet"
        title={t("portal.title", "Client portal")}
        description={t("portal.intro", "This space's B2C portal. Clients you invite log in to order & follow. Pick what an entity is called, then list them.")}
      />

      {/* Portal identity card — same visual language as the Clients Portals cards */}
      {portalQ.isLoading ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold", portalTile(meta.accent))}>
              {portalInitials(portal?.name)}
            </div>
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium", portalTile(meta.accent))}>
              {t(`portal.type.${meta.key}`, meta.badge)}
            </span>
          </div>
          <p className="mt-4 truncate font-semibold text-foreground">{portal?.name || t("portal.title", "Client portal")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("portal.entityIs", "Entity: {{e}}", { e: entityLabel })}</p>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /><span className="font-medium text-foreground tabular-nums">{clientCount}</span> {t("portal.residents", "clients")}</span>
            <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /><span className="font-medium text-foreground tabular-nums">{units.length}</span> {t("portal.catalogCount", "{{label}}", { label: entityLabel.toLowerCase() + "s" })}</span>
          </div>
        </div>
      )}

      {/* Portal type — radio-card picker (same structure as the Create-portal dialog) */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("portal.entityType", "Portal type")}</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((x) => {
            const active = (portal?.templateKey || "custom") === x.key
            return (
              <button key={x.key} type="button" disabled={setType.isPending} onClick={() => !active && setType.mutate(x.key)}
                className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  active ? "border-primary bg-primary/5 ring-1 ring-inset ring-primary/20" : "border-border hover:border-border/80 hover:bg-accent/30")}>
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold", portalTile(x.accent))}>
                  {t(`portal.type.${x.key}`, x.badge).slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {t(`portal.tpl.${x.key}`, x.label)}
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{t(`portal.blurb.${x.key}`, x.blurb)}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Catalog */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("portal.catalog", "{{label}} list", { label: entityLabel + "s" })}</h3>
            <p className="text-xs text-muted-foreground">{t("portal.catalogHint", "The list clients get assigned to. Assign one when you invite a client.")}</p>
          </div>
          <UnitDialog spaceId={spaceId} entityLabel={entityLabel} onSaved={invalidateUnits} trigger={
            <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("portal.addUnit", "Add {{label}}", { label: entityLabel })}</Button>
          } />
        </div>

        {unitsQ.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : units.length === 0 ? (
          <EmptyState icon={Home} title={t("portal.noUnits", "No {{label}} yet", { label: entityLabel.toLowerCase() + "s" })} />
        ) : (
          <div className="space-y-2">
            {units.map((u: SpaceUnit) => (
              <div key={u.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-border/80">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", portalTile(meta.accent))}>
                  <Home className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                  {u.address && u.address !== u.name && <p className="truncate text-xs text-muted-foreground">{u.address}</p>}
                </div>
                {u.customer ? (
                  <Badge variant="secondary" className="gap-1"><UserCheck className="h-3 w-3" /> {u.customer.name}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">{t("portal.vacant", "Vacant")}</Badge>
                )}
                {!u.customer && (
                  <button onClick={() => del.mutate(u.id)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UnitDialog({ spaceId, entityLabel, onSaved, trigger }: { spaceId: string; entityLabel: string; onSaved: () => void; trigger: React.ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)

  const add = useMutation({
    mutationFn: () => spacePortalApi.addUnit(spaceId, { name: name.trim() || address, address, lat: lat ?? undefined, lng: lng ?? undefined }),
    onSuccess: () => { notify.success(t("portal.unitAdded", "Added")); onSaved(); setOpen(false); setName(""); setAddress(""); setLat(null); setLng(null) },
    onError: (e: any) => notify.error(e.message || "Could not add"),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("portal.addUnit", "Add {{label}}", { label: entityLabel })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("portal.unitName", "{{label}} name / number", { label: entityLabel })}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("portal.unitNamePh", "e.g. Apartment 4B")} />
          </div>
          <div className="space-y-1">
            <Label>{t("customers.address", "Address")}</Label>
            <LocationPicker address={address} lat={lat} lng={lng} onLocationChange={(a, la, ln) => { setAddress(a); setLat(la); setLng(ln) }} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={(!name.trim() && !address.trim()) || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
