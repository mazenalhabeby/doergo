"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Home, Plus, Trash2, Pencil, UserCheck, Users, Check, HardHat, X } from "lucide-react"

import { spaceUnitsApi, customersApi, organizationsApi, type SpaceUnit, type OrgMember } from "@/lib/api"
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { SectionHeader, EmptyState } from "./section-header"

const LocationPicker = dynamic(
  () => import("../../_components/location-picker"),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" /> },
) as unknown as React.ComponentType<{
  address: string; lat: number | null; lng: number | null
  onLocationChange: (address: string, lat: number | null, lng: number | null) => void
}>

const memberName = (m: OrgMember) => `${m.firstName} ${m.lastName}`.trim()
const memberInitials = (m: OrgMember) => `${m.firstName?.[0] ?? ""}${m.lastName?.[0] ?? ""}`.toUpperCase() || "?"

export function ApartmentsTab({ spaceId, hasB2C }: { spaceId: string; hasB2C?: boolean }) {
  const { t } = useTranslation()
  const router = useRouter()
  const qc = useQueryClient()
  const unitsQ = useQuery({ queryKey: ["space-units-dir", spaceId], queryFn: () => spaceUnitsApi.list(spaceId) })
  const membersQ = useQuery({ queryKey: ["org-members-assignable"], queryFn: () => organizationsApi.getMembers({ limit: 100 }) })
  const members = (membersQ.data?.data ?? []).filter((m) => m.isActive && m.role !== "CUSTOMER")
  const memberById = new Map(members.map((m) => [m.id, m]))
  const units = unitsQ.data ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ["space-units-dir", spaceId] })

  const del = useMutation({
    mutationFn: (unitId: string) => spaceUnitsApi.remove(spaceId, unitId),
    onSuccess: () => { notify.success(t("apartments.removed", "Removed")); invalidate() },
  })

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Home}
        accent="sky"
        title={t("apartments.title", "Apartments / Units")}
        description={t("apartments.intro", "The apartments in this space. Assign the resident who lives in each and the workers responsible for it.")}
        action={<ApartmentDialog spaceId={spaceId} members={members} hasB2C={hasB2C} onSaved={invalidate} trigger={
          <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("apartments.add", "Add apartment")}</Button>
        } />}
      />

      {unitsQ.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : units.length === 0 ? (
        <EmptyState icon={Home} title={t("apartments.empty", "No apartments yet")} />
      ) : (
        <div className="space-y-2">
          {units.map((u: SpaceUnit) => {
            const workers = (u.workerIds ?? []).map((id) => memberById.get(id)).filter(Boolean) as OrgMember[]
            return (
              <div key={u.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
                <button onClick={() => router.push(`/apartments/${u.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"><Home className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{u.name}</p>
                    {u.address && u.address !== u.name && <p className="truncate text-xs text-muted-foreground">{u.address}</p>}
                  </div>
                </button>
                {/* Workers */}
                {workers.length > 0 && (
                  <div className="hidden items-center -space-x-1.5 sm:flex" title={workers.map(memberName).join(", ")}>
                    {workers.slice(0, 3).map((m) => (
                      <span key={m.id} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-[9px] font-semibold text-primary">{memberInitials(m)}</span>
                    ))}
                    {workers.length > 3 && <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[9px] font-semibold text-muted-foreground">+{workers.length - 3}</span>}
                  </div>
                )}
                {/* Resident */}
                {u.customer ? (
                  <Badge variant="secondary" className="gap-1"><UserCheck className="h-3 w-3" /> {u.customer.name}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">{t("apartments.vacant", "Vacant")}</Badge>
                )}
                <ApartmentDialog spaceId={spaceId} members={members} hasB2C={hasB2C} existing={u} onSaved={invalidate} trigger={
                  <button className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"><Pencil className="h-4 w-4" /></button>
                } />
                <button onClick={() => del.mutate(u.id)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ApartmentDialog({ spaceId, members, hasB2C, existing, onSaved, trigger }: {
  spaceId: string; members: OrgMember[]; hasB2C?: boolean; existing?: SpaceUnit; onSaved: () => void; trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? "")
  const [address, setAddress] = useState(existing?.address ?? "")
  const [lat, setLat] = useState<number | null>(existing?.lat ?? null)
  const [lng, setLng] = useState<number | null>(existing?.lng ?? null)
  const [workerIds, setWorkerIds] = useState<string[]>(existing?.workerIds ?? [])
  const [residentId, setResidentId] = useState<string>(existing?.customer?.id ?? "")

  // A resident is a customer with APP ACCESS (a portal resident) — so the pool
  // only exists when the space runs a B2C portal. Without it, an apartment has
  // workers only.
  const residentsQ = useQuery({
    queryKey: ["space-app-residents", spaceId],
    queryFn: () => customersApi.list({ spaceId, portalResident: true, limit: 100 }),
    enabled: open && !!hasB2C,
  })
  const residents = residentsQ.data?.data ?? []

  const save = useMutation({
    mutationFn: async () => {
      const base = { name: name.trim() || address, address, lat: lat ?? undefined, lng: lng ?? undefined, workerIds }
      if (existing) {
        return spaceUnitsApi.update(spaceId, existing.id, { ...base, customerId: residentId || null })
      }
      const created = await spaceUnitsApi.create(spaceId, base)
      if (residentId) await spaceUnitsApi.update(spaceId, created.id, { customerId: residentId })
      return created
    },
    onSuccess: () => { notify.success(existing ? t("apartments.updated", "Apartment updated") : t("apartments.added", "Apartment added")); onSaved(); setOpen(false) },
    onError: (e: any) => notify.error(e.message || "Could not save"),
  })

  const toggleWorker = (id: string) => setWorkerIds((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]))
  const assignedWorkers = members.filter((m) => workerIds.includes(m.id))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{existing ? t("apartments.edit", "Edit apartment") : t("apartments.add", "Add apartment")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("apartments.name", "Name / number")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("apartments.namePh", "e.g. Apartment 4B")} />
          </div>
          <div className="space-y-1">
            <Label>{t("customers.address", "Address")}</Label>
            <LocationPicker address={address} lat={lat} lng={lng} onLocationChange={(a, la, ln) => { setAddress(a); setLat(la); setLng(ln) }} />
          </div>

          {/* Resident — only when the space runs a B2C portal (app-access customers). */}
          {hasB2C && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-muted-foreground" /> {t("apartments.resident", "Resident (app access)")}</Label>
              <Select value={residentId || "none"} onValueChange={(v) => setResidentId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={t("apartments.noResident", "No resident")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("apartments.noResident", "No resident")}</SelectItem>
                  {residents.length === 0
                    ? <div className="px-2 py-2 text-center text-xs text-muted-foreground">{t("apartments.noAppResidents", "No app residents yet — invite a customer from the portal.")}</div>
                    : residents.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Workers */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5"><HardHat className="h-3.5 w-3.5 text-muted-foreground" /> {t("apartments.workers", "Responsible workers")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Users className="h-3.5 w-3.5" /> {t("customers.assign", "Assign")}</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 w-60 overflow-y-auto">
                  <DropdownMenuLabel>{t("apartments.assignWorkers", "Assign workers")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {members.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("customers.noMembers", "No members")}</p>
                  ) : members.map((m) => (
                    <DropdownMenuItem key={m.id} onSelect={(e) => { e.preventDefault(); toggleWorker(m.id) }} className="gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{memberInitials(m)}</span>
                      <span className="min-w-0 flex-1 truncate">{memberName(m)}</span>
                      {workerIds.includes(m.id) && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {assignedWorkers.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("apartments.noWorkers", "No workers assigned yet.")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assignedWorkers.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pl-0.5 pr-2 text-xs font-medium text-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{memberInitials(m)}</span>
                    <span className="max-w-[9rem] truncate">{memberName(m)}</span>
                    <button onClick={() => toggleWorker(m.id)} className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={(!name.trim() && !address.trim()) || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
