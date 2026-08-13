"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, Plus, Trash2, Home, UserCheck } from "lucide-react"

import { spacePortalApi, type SpaceUnit } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import { SectionHeader, EmptyState } from "./section-header"

const LocationPicker = dynamic(
  () => import("../../_components/location-picker"),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" /> },
) as unknown as React.ComponentType<{
  address: string; lat: number | null; lng: number | null
  onLocationChange: (address: string, lat: number | null, lng: number | null) => void
}>

const ENTITY_TYPES = [
  { key: "rental", label: "Apartments (rental)" },
  { key: "logistics", label: "Orders (delivery)" },
  { key: "workplace", label: "Workspaces" },
  { key: "custom", label: "Units (generic)" },
]

export function PortalTab({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const portalQ = useQuery({ queryKey: ["space-portal", spaceId], queryFn: () => spacePortalApi.get(spaceId) })
  const unitsQ = useQuery({ queryKey: ["space-units", spaceId], queryFn: () => spacePortalApi.units(spaceId) })
  const entityLabel = portalQ.data?.entityLabel || "Unit"
  const units = unitsQ.data ?? []

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

      {/* Entity type */}
      <div className="rounded-xl border border-border bg-card p-4">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("portal.entityType", "Portal type")}</Label>
        <div className="mt-2 max-w-xs">
          {portalQ.isLoading ? <Skeleton className="h-9 w-full" /> : (
            <Select value={portalQ.data?.templateKey || "custom"} onValueChange={(v) => setType.mutate(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
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
              <div key={u.id} className="group flex items-center gap-3 rounded-xl border border-border p-3">
                <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
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
