"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Check, User, Smartphone, Search, Ban, Plus, Trash2 } from "lucide-react"

import { spaceUnitsApi, customersApi, organizationsApi, type SpaceUnit, type OrgMember } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"

const LocationPicker = dynamic(
  () => import("../../_components/location-picker"),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" /> },
) as unknown as React.ComponentType<{
  lat: number | null; lng: number | null; radius: number; address: string
  onLocationChange: (lat: number, lng: number) => void
  onAddressChange: (address: string) => void
}>

// Resident is encoded as "u:<userId>" (member) or "c:<customerId>" (client).
const encodeResident = (u?: SpaceUnit) => u?.residentUserId ? `u:${u.residentUserId}` : u?.customer ? `c:${u.customer.id}` : "none"
const memberName = (m: OrgMember) => `${m.firstName} ${m.lastName}`.trim()
const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"

export function ApartmentDialog({ spaceId, apartmentPortalIds, existing, onSaved, trigger, hideResident, entityLabel }: {
  // apartmentPortalIds = ids of this space's B2C portals whose entity is
  // Apartment. Non-empty ⇒ the apartment can host a CLIENT resident, and the
  // client candidates are scoped to those portals. Empty ⇒ members only.
  // hideResident = reuse the full apartment model without the Resident picker
  // (e.g. the portal invite, where the resident IS the client being invited).
  // entityLabel = generalize the copy for non-apartment portals (Order/Workspace…);
  // falls back to "Apartment" when absent (the space Apartments tab).
  spaceId: string; apartmentPortalIds?: string[]; existing?: SpaceUnit; onSaved: (unit?: SpaceUnit) => void; trigger: React.ReactNode; hideResident?: boolean; entityLabel?: string
}) {
  const hasApartmentPortal = !hideResident && (apartmentPortalIds?.length ?? 0) > 0
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? "")
  const [address, setAddress] = useState(existing?.address ?? "")
  const [lat, setLat] = useState<number | null>(existing?.lat ?? null)
  const [lng, setLng] = useState<number | null>(existing?.lng ?? null)
  const [resident, setResident] = useState<string>(encodeResident(existing))
  const [tab, setTab] = useState<"members" | "clients">("members")
  const [q, setQ] = useState("")
  const [details, setDetails] = useState<{ label: string; value: string }[]>(existing?.details ?? [])
  const setDetail = (i: number, k: "label" | "value", v: string) => setDetails((d) => d.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)))

  const membersQ = useQuery({ queryKey: ["org-members-assignable"], queryFn: () => organizationsApi.getMembers({ limit: 100 }), enabled: open })
  const members = (membersQ.data?.data ?? []).filter((m) => m.isActive && m.role !== "CUSTOMER")
  // Clients = this SPACE's app-access customers, scoped to the Apartment-entity
  // portals (a rental+logistics space won't offer logistics clients as residents).
  const clientsQ = useQuery({
    queryKey: ["space-app-residents", spaceId],
    queryFn: () => customersApi.list({ spaceId, portalResident: true, limit: 100 }),
    enabled: open && hasApartmentPortal,
  })
  const clients = (clientsQ.data?.data ?? []).filter((c) => c.portalId && apartmentPortalIds!.includes(c.portalId))

  const save = useMutation({
    mutationFn: () => {
      const residentUserId = resident.startsWith("u:") ? resident.slice(2) : null
      const customerId = resident.startsWith("c:") ? resident.slice(2) : null
      const cleanDetails = details.map((d) => ({ label: d.label.trim(), value: d.value.trim() })).filter((d) => d.label)
      const base = { name: name.trim() || address, address, lat: lat ?? undefined, lng: lng ?? undefined, residentUserId, customerId, details: cleanDetails }
      return existing ? spaceUnitsApi.update(spaceId, existing.id, base) : spaceUnitsApi.create(spaceId, base)
    },
    onSuccess: (unit) => {
      notify.success(entityLabel
        ? (existing ? t("apartments.updatedEntity", "{{e}} updated", { e: entityLabel }) : t("apartments.addedEntity", "{{e}} added", { e: entityLabel }))
        : (existing ? t("apartments.updated", "Apartment updated") : t("apartments.added", "Apartment added")))
      onSaved(unit); setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message || "Could not save"),
  })

  // Rows for the active tab.
  const rows = (tab === "members"
    ? members.map((m) => ({ value: `u:${m.id}`, name: memberName(m), sub: t("apartments.memberTag", "Member (staff)") }))
    : clients.map((c) => ({ value: `c:${c.id}`, name: c.name, sub: t("customers.appAccess", "App access") }))
  ).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const loading = tab === "members" ? membersQ.isLoading : clientsQ.isLoading

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{entityLabel
          ? (existing ? t("apartments.editEntity", "Edit {{e}}", { e: entityLabel }) : t("apartments.addEntity", "Add {{e}}", { e: entityLabel }))
          : (existing ? t("apartments.edit", "Edit apartment") : t("apartments.add", "Add apartment"))}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("apartments.name", "Name / number")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("apartments.namePh", "e.g. Apartment 4B")} />
          </div>
          <div className="space-y-1">
            <Label>{t("customers.address", "Address")}</Label>
            <LocationPicker lat={lat} lng={lng} radius={0} address={address}
              onLocationChange={(la, ln) => { setLat(la); setLng(ln) }}
              onAddressChange={(a) => setAddress(a)} />
          </div>

          {/* Resident — tabbed picker: Members always, Clients when a B2C portal runs.
              Hidden when reused from the invite (the resident is the invited client). */}
          {!hideResident && (
          <div className="space-y-1.5">
            <Label>{t("apartments.resident", "Resident (lives here)")}</Label>
            <div className="rounded-xl border border-border">
              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-border p-1">
                <TabBtn active={tab === "members"} onClick={() => { setTab("members"); setQ("") }} icon={User} label={t("apartments.members", "Members")} />
                {hasApartmentPortal && <TabBtn active={tab === "clients"} onClick={() => { setTab("clients"); setQ("") }} icon={Smartphone} label={t("apartments.clients", "Clients")} />}
                <button type="button" onClick={() => setResident("none")}
                  className={cn("ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    resident === "none" ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                  <Ban className="h-3.5 w-3.5" /> {t("apartments.vacant", "Vacant")}
                </button>
              </div>
              {/* Search */}
              <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search", "Search…")}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </div>
              {/* List */}
              <div className="max-h-52 overflow-y-auto p-1">
                {loading ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">{t("common.loading", "Loading…")}</p>
                ) : rows.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {tab === "clients" ? t("apartments.noAppResidents", "No app clients yet — invite one from the portal.") : t("apartments.noMembers", "No members")}
                  </p>
                ) : rows.map((r) => {
                  const sel = resident === r.value
                  return (
                    <button key={r.value} type="button" onClick={() => setResident(r.value)}
                      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                        sel ? "bg-primary/10" : "hover:bg-muted")}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials(r.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{r.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{r.sub}</span>
                      </span>
                      {sel && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          )}

          {/* More info — flexible property attributes (floor, size, rent, access…). */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("apartments.moreInfo", "More info")}</Label>
              <button type="button" onClick={() => setDetails((d) => [...d, { label: "", value: "" }])} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" /> {t("customers.addField", "Add field")}
              </button>
            </div>
            {details.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("apartments.moreInfoHint", "Floor, rooms, size, rent, access code, meter numbers…")}</p>
            ) : (
              <div className="space-y-2">
                {details.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={d.label} onChange={(e) => setDetail(i, "label", e.target.value)} placeholder={t("customers.fieldLabel", "Label")} className="w-2/5" />
                    <Input value={d.value} onChange={(e) => setDetail(i, "value", e.target.value)} placeholder={t("customers.fieldValue", "Value")} className="flex-1" />
                    <button type="button" onClick={() => setDetails((arr) => arr.filter((_, idx) => idx !== i))} className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
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

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
