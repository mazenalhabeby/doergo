"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { MapPin, Plus, Star, Trash2, Pencil, ChevronDown, ChevronUp, Home, User, Phone } from "lucide-react"

import { customersApi, spacePortalApi, portalAdminApi, type CustomerAddress, type SpaceUnit } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"

const AddressMap = dynamic(() => import("./address-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
})
type LPProps = {
  lat: number | null
  lng: number | null
  radius: number
  address: string
  onLocationChange: (lat: number, lng: number) => void
  onAddressChange: (address: string) => void
}
const LocationPicker = dynamic(
  () => import("../../locations/_components/location-picker"),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" /> },
) as unknown as React.ComponentType<LPProps>

/** Addresses panel for a customer record. When the space runs a B2C portal, this
 *  becomes the portal's entity (e.g. "Apartments") and lets you assign one from
 *  the space catalog. */
export function AddressesPanel({ customerId, spaceId, hasPortal, portalId }: { customerId: string; spaceId?: string; hasPortal?: boolean; portalId?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showAll, setShowAll] = useState(false)

  const q = useQuery({ queryKey: ["customer-addresses", customerId], queryFn: () => customersApi.addresses(customerId) })
  // Resolve the entity from the customer's OWN portal (a space can run several
  // portals with different entities); fall back to the space's default portal.
  const custPortalQ = useQuery({ queryKey: ["portal", portalId], queryFn: () => portalAdminApi.getPortal(portalId!), enabled: !!portalId })
  const spacePortalQ = useQuery({ queryKey: ["space-portal", spaceId], queryFn: () => spacePortalApi.get(spaceId!), enabled: !portalId && !!spaceId && !!hasPortal })
  const portal = custPortalQ.data ?? spacePortalQ.data
  const addresses = q.data ?? []
  const primary = addresses.find((a) => a.isPrimary) ?? addresses[0] ?? null
  const others = addresses.filter((a) => a.id !== primary?.id)
  const invalidate = () => qc.invalidateQueries({ queryKey: ["customer-addresses", customerId] })
  const entityLabel = portal?.entityLabel
  const label = entityLabel ? `${entityLabel}s` : t("customers.addresses", "Addresses")
  // "Assign from the catalog" only applies to the Apartment entity (the space's
  // managed apartment pool). Other entities (Order/Workspace) are added per-client.
  const isApartment = portal?.templateKey === "rental" || (entityLabel || "").toLowerCase().startsWith("apartment")
  // The apartment catalog lives in the PORTAL's space — scope assignment there so
  // apartments in other spaces are never offered (cross-space isolation).
  const assignSpaceId = custPortalQ.data?.spaceId ?? spaceId

  const setPrimary = useMutation({ mutationFn: (unitId: string) => customersApi.setPrimaryAddress(customerId, unitId), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (unitId: string) => customersApi.removeAddress(customerId, unitId), onSuccess: () => { notify.success(t("customers.addressRemoved", "Address removed")); invalidate() } })

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex items-center justify-between px-4 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="flex items-center gap-3">
          {isApartment && assignSpaceId && (
            <AssignDialog spaceId={assignSpaceId} customerId={customerId} entityLabel={entityLabel!} onSaved={invalidate} trigger={
              <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Home className="h-3.5 w-3.5" /> {t("customers.assign", "Assign")}</button>
            } />
          )}
          <AddressDialog customerId={customerId} onSaved={invalidate} isFirst={addresses.length === 0} trigger={
            <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> {t("customers.addAddress", "Add")}</button>
          } />
        </div>
      </div>

      {q.isLoading ? (
        <div className="p-4"><Skeleton className="h-40 w-full rounded-lg" /></div>
      ) : !primary ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("customers.noAddress", "No address yet. Add one to show it on the map.")}</p>
      ) : (
        <div className="p-4 pt-3">
          {/* Map for the primary address */}
          {primary.lat != null && primary.lng != null && (
            <div className="mb-3 h-40 overflow-hidden rounded-lg border border-border">
              <AddressMap lat={primary.lat} lng={primary.lng} />
            </div>
          )}
          {/* Primary address row */}
          <AddressRow addr={primary} isPrimary onRemove={others.length + 1 > 1 ? () => remove.mutate(primary.id) : undefined} customerId={customerId} onSaved={invalidate} />

          {/* Others */}
          {others.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setShowAll((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showAll ? t("customers.hide", "Hide") : t("customers.moreAddresses", "+{{count}} more", { count: others.length })}
              </button>
              {showAll && (
                <div className="mt-2 space-y-1.5">
                  {others.map((a) => (
                    <AddressRow key={a.id} addr={a} customerId={customerId} onSaved={invalidate}
                      onMakePrimary={() => setPrimary.mutate(a.id)} onRemove={() => remove.mutate(a.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AddressRow({ addr, isPrimary, customerId, onSaved, onMakePrimary, onRemove }: {
  addr: CustomerAddress; isPrimary?: boolean; customerId: string; onSaved: () => void; onMakePrimary?: () => void; onRemove?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="group flex items-start gap-2 rounded-lg border border-border/60 p-2.5">
      <MapPin className={cn("mt-0.5 h-4 w-4 shrink-0", isPrimary ? "text-primary" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{addr.name}</span>
          {isPrimary && <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"><Star className="h-2.5 w-2.5 fill-current" /> {t("customers.primary", "Primary")}</span>}
        </div>
        {addr.address && addr.address !== addr.name && <p className="truncate text-xs text-muted-foreground">{addr.address}</p>}
        {addr.contactName && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {addr.contactName}</span>
            {addr.contactPhone && (
              <a href={`tel:${addr.contactPhone}`} className="inline-flex items-center gap-1 hover:text-primary">
                <Phone className="h-3 w-3" /> {addr.contactPhone}
              </a>
            )}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {onMakePrimary && <button title={t("customers.makePrimary", "Make primary")} onClick={onMakePrimary} className="rounded p-1 text-muted-foreground hover:text-primary"><Star className="h-3.5 w-3.5" /></button>}
        <AddressDialog customerId={customerId} existing={addr} onSaved={onSaved} trigger={
          <button className="rounded p-1 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
        } />
        {onRemove && <button title={t("common.remove", "Remove")} onClick={onRemove} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
  )
}

function AddressDialog({ customerId, existing, isFirst, onSaved, trigger }: {
  customerId: string; existing?: CustomerAddress; isFirst?: boolean; onSaved: () => void; trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? "")
  const [address, setAddress] = useState(existing?.address ?? "")
  const [lat, setLat] = useState<number | null>(existing?.lat ?? null)
  const [lng, setLng] = useState<number | null>(existing?.lng ?? null)
  const [contactName, setContactName] = useState(existing?.contactName ?? "")
  const [contactPhone, setContactPhone] = useState(existing?.contactPhone ?? "")
  const [makePrimary, setMakePrimary] = useState(existing?.isPrimary ?? !!isFirst)

  const save = useMutation({
    mutationFn: async () => {
      const contact = { contactName: contactName.trim() || null, contactPhone: contactPhone.trim() || null }
      if (existing) {
        await customersApi.updateAddress(customerId, existing.id, { name: name.trim() || address, address, lat: lat ?? undefined, lng: lng ?? undefined, ...contact })
        if (makePrimary && !existing.isPrimary) await customersApi.setPrimaryAddress(customerId, existing.id)
      } else {
        await customersApi.addAddress(customerId, { name: name.trim() || address, address, lat: lat ?? undefined, lng: lng ?? undefined, isPrimary: makePrimary, ...contact })
      }
    },
    onSuccess: () => { notify.success(existing ? t("customers.addressUpdated", "Address updated") : t("customers.addressAdded", "Address added")); onSaved(); setOpen(false) },
    onError: (e: any) => notify.error(e.message || "Could not save"),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? t("customers.editAddress", "Edit address") : t("customers.addAddress", "Add address")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("customers.addressLabel", "Label")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("customers.addressLabelPh", "e.g. HQ, Apartment 4B")} />
          </div>
          <div className="space-y-1">
            <Label>{t("customers.address", "Address")}</Label>
            <LocationPicker lat={lat} lng={lng} radius={0} address={address}
              onLocationChange={(la, ln) => { setLat(la); setLng(ln) }}
              onAddressChange={(a) => setAddress(a)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("customers.contactPerson", "Contact person")}</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={t("customers.contactPersonPh", "On-site contact")} />
            </div>
            <div className="space-y-1">
              <Label>{t("customers.contactPhone", "Contact phone")}</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+43 …" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={makePrimary} onCheckedChange={(v) => setMakePrimary(!!v)} disabled={existing?.isPrimary} />
            {t("customers.setPrimary", "Primary address (shown on the map)")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!address.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Assign an existing unit (apartment) from the space catalog to this customer.
function AssignDialog({ spaceId, customerId, entityLabel, onSaved, trigger }: {
  spaceId: string; customerId: string; entityLabel: string; onSaved: () => void; trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const unitsQ = useQuery({ queryKey: ["space-units", spaceId], queryFn: () => spacePortalApi.units(spaceId), enabled: open })
  // Vacant = no client AND no member resident (never offer a member's home).
  const vacant = (unitsQ.data ?? []).filter((u: SpaceUnit) => !u.customerId && !u.residentUserId)

  const assign = useMutation({
    mutationFn: (unitId: string) => spacePortalApi.assign(spaceId, unitId, customerId),
    onSuccess: () => { notify.success(t("customers.assigned", "Assigned")); onSaved(); setOpen(false) },
    onError: (e: any) => notify.error(e.message || "Could not assign"),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("customers.assignEntity", "Assign {{label}}", { label: entityLabel })}</DialogTitle></DialogHeader>
        {unitsQ.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : vacant.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("customers.noVacant", "No vacant {{label}}. Add one in the space's Client portal tab.", { label: entityLabel.toLowerCase() + "s" })}</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {vacant.map((u: SpaceUnit) => (
              <button key={u.id} disabled={assign.isPending} onClick={() => assign.mutate(u.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-muted/50">
                <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                  {u.address && u.address !== u.name && <p className="truncate text-xs text-muted-foreground">{u.address}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
