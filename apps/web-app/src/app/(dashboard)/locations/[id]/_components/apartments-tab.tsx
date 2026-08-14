"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Home, Plus, Trash2, Pencil, UserCheck, User, Smartphone } from "lucide-react"

import { spaceUnitsApi, customersApi, organizationsApi, type SpaceUnit } from "@/lib/api"
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select"
import { SectionHeader, EmptyState } from "./section-header"

const LocationPicker = dynamic(
  () => import("../../_components/location-picker"),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" /> },
) as unknown as React.ComponentType<{
  address: string; lat: number | null; lng: number | null
  onLocationChange: (address: string, lat: number | null, lng: number | null) => void
}>

// A unit's resident is encoded as "u:<userId>" (member) or "c:<customerId>" (client).
const encodeResident = (u?: SpaceUnit) => u?.residentUserId ? `u:${u.residentUserId}` : u?.customer ? `c:${u.customer.id}` : "none"

export function ApartmentsTab({ spaceId, hasB2C }: { spaceId: string; hasB2C?: boolean }) {
  const { t } = useTranslation()
  const router = useRouter()
  const qc = useQueryClient()
  const unitsQ = useQuery({ queryKey: ["space-units-dir", spaceId], queryFn: () => spaceUnitsApi.list(spaceId) })
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
        description={t("apartments.introHousing", "Apartments this space owns. Give one to a member to live in — or, with a client portal, to a client. Work on them is handled by tasks.")}
        action={<ApartmentDialog spaceId={spaceId} hasB2C={hasB2C} onSaved={invalidate} trigger={
          <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("apartments.add", "Add apartment")}</Button>
        } />}
      />

      {unitsQ.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : units.length === 0 ? (
        <EmptyState icon={Home} title={t("apartments.empty", "No apartments yet")} />
      ) : (
        <div className="space-y-2">
          {units.map((u: SpaceUnit) => (
            <div key={u.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
              <button onClick={() => router.push(`/apartments/${u.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"><Home className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{u.name}</p>
                  {u.address && u.address !== u.name && <p className="truncate text-xs text-muted-foreground">{u.address}</p>}
                </div>
              </button>
              <ResidentBadge unit={u} />
              <ApartmentDialog spaceId={spaceId} hasB2C={hasB2C} existing={u} onSaved={invalidate} trigger={
                <button className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"><Pencil className="h-4 w-4" /></button>
              } />
              <button onClick={() => del.mutate(u.id)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResidentBadge({ unit }: { unit: SpaceUnit }) {
  const { t } = useTranslation()
  if (unit.residentUser) {
    return <Badge variant="secondary" className="gap-1"><User className="h-3 w-3" /> {`${unit.residentUser.firstName} ${unit.residentUser.lastName}`.trim()}</Badge>
  }
  if (unit.customer) {
    return <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300"><Smartphone className="h-3 w-3" /> {unit.customer.name}</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground">{t("apartments.vacant", "Vacant")}</Badge>
}

function ApartmentDialog({ spaceId, hasB2C, existing, onSaved, trigger }: {
  spaceId: string; hasB2C?: boolean; existing?: SpaceUnit; onSaved: () => void; trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? "")
  const [address, setAddress] = useState(existing?.address ?? "")
  const [lat, setLat] = useState<number | null>(existing?.lat ?? null)
  const [lng, setLng] = useState<number | null>(existing?.lng ?? null)
  const [resident, setResident] = useState<string>(encodeResident(existing))

  // Candidate pools: members always; clients (app access) only with a B2C portal.
  const membersQ = useQuery({ queryKey: ["org-members-assignable"], queryFn: () => organizationsApi.getMembers({ limit: 100 }), enabled: open })
  const members = (membersQ.data?.data ?? []).filter((m) => m.isActive && m.role !== "CUSTOMER")
  const clientsQ = useQuery({
    queryKey: ["space-app-residents", spaceId],
    queryFn: () => customersApi.list({ spaceId, portalResident: true, limit: 100 }),
    enabled: open && !!hasB2C,
  })
  const clients = clientsQ.data?.data ?? []

  const save = useMutation({
    mutationFn: async () => {
      const residentUserId = resident.startsWith("u:") ? resident.slice(2) : null
      const customerId = resident.startsWith("c:") ? resident.slice(2) : null
      const base = { name: name.trim() || address, address, lat: lat ?? undefined, lng: lng ?? undefined, residentUserId, customerId }
      return existing ? spaceUnitsApi.update(spaceId, existing.id, base) : spaceUnitsApi.create(spaceId, base)
    },
    onSuccess: () => { notify.success(existing ? t("apartments.updated", "Apartment updated") : t("apartments.added", "Apartment added")); onSaved(); setOpen(false) },
    onError: (e: any) => notify.error(e.message || "Could not save"),
  })

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

          {/* Resident — a member (always) or, with a client portal, a client. */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-muted-foreground" /> {t("apartments.resident", "Resident (lives here)")}</Label>
            <Select value={resident} onValueChange={setResident}>
              <SelectTrigger><SelectValue placeholder={t("apartments.vacant", "Vacant")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("apartments.vacant", "Vacant")}</SelectItem>
                <SelectGroup>
                  <SelectLabel>{t("apartments.members", "Members")}</SelectLabel>
                  {members.map((m) => <SelectItem key={m.id} value={`u:${m.id}`}>{`${m.firstName} ${m.lastName}`.trim()}</SelectItem>)}
                </SelectGroup>
                {hasB2C && (
                  <SelectGroup>
                    <SelectLabel>{t("apartments.clients", "Clients · app access")}</SelectLabel>
                    {clients.length === 0
                      ? <div className="px-2 py-1.5 text-center text-xs text-muted-foreground">{t("apartments.noAppResidents", "No app clients yet — invite one from the portal.")}</div>
                      : clients.map((c) => <SelectItem key={c.id} value={`c:${c.id}`}>{c.name}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
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
