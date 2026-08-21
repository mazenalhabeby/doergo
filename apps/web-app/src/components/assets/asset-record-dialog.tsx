"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Ban, Check, Plus, Search, Smartphone, Trash2, User, X } from "lucide-react"

import { assetsApi, customersApi, organizationsApi, type AssetCategory, type OrgMember } from "@/lib/api"
import {
  normalizeKindShape, detailRowsForKind, kindHolderLabel, kindNameLabel,
  KIND_SHAPE_LIMITS, type DetailRow,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"

const LocationPicker = dynamic(
  () => import("@/app/(dashboard)/locations/_components/location-picker"),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" /> },
) as unknown as React.ComponentType<{
  lat: number | null; lng: number | null; radius: number; address: string
  onLocationChange: (lat: number, lng: number) => void
  onAddressChange: (address: string) => void
}>

/** One record of a kind — an apartment, a van. */
export interface AssetRecord {
  id: string
  name: string
  serialNumber?: string | null
  locationAddress?: string | null
  locationLat?: number | null
  locationLng?: number | null
  holderUserId?: string | null
  customerId?: string | null
  /** Who holds it. One entry, or several when the type allows it. */
  holders?: Array<{ userId?: string | null; customerId?: string | null }>
  details?: unknown
}

/*
  A holder is one string: "u:<userId>" or "c:<customerId>".

  One encoding for both sides keeps selection a set-membership test instead of
  two parallel lists that can disagree about who is chosen — and makes the
  single case a list of length one rather than a separate code path.
*/
const encodeHolders = (r?: AssetRecord): string[] => {
  if (r?.holders?.length) {
    return r.holders.map((h) => (h.userId ? `u:${h.userId}` : `c:${h.customerId}`)).filter(Boolean) as string[]
  }
  // A record saved before types could hold several still answers the old way.
  if (r?.holderUserId) return [`u:${r.holderUserId}`]
  if (r?.customerId) return [`c:${r.customerId}`]
  return []
}
const memberName = (m: OrgMember) => `${m.firstName} ${m.lastName}`.trim()
const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"

/**
 * Add or edit one record, built from what its KIND says.
 *
 * Every part is here because the kind asked for it: the name carries the label
 * that kind chose, the map appears only if it has an address, the holder picker
 * is called whatever that kind calls it and offers only the sides it allows, and
 * the fields are the ones that kind prompts for. Nothing here knows what an
 * apartment is.
 */
export function AssetRecordDialog({
  spaceId,
  kind,
  existing,
  onSaved,
  trigger,
}: {
  spaceId: string
  kind: AssetCategory
  existing?: AssetRecord
  onSaved: () => void
  trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const shape = normalizeKindShape(kind.config)
  const [open, setOpen] = useState(false)

  const [name, setName] = useState(existing?.name ?? "")
  const [address, setAddress] = useState(existing?.locationAddress ?? "")
  const [lat, setLat] = useState<number | null>(existing?.locationLat ?? null)
  const [lng, setLng] = useState<number | null>(existing?.locationLng ?? null)
  const [holders, setHolders] = useState<string[]>(encodeHolders(existing))

  /*
    Picking somebody.

    On a "one at a time" type a click REPLACES, which is what a single choice
    means and saves a deselect-then-select every time somebody moves a van to a
    new driver. On a "several" type it toggles, and the cap is the same one the
    server enforces — reached here it just stops adding rather than letting
    somebody build a list that will be refused on save.
  */
  const toggleHolder = (value: string) =>
    setHolders((prev) => {
      if (!shape.holder.multiple) return prev[0] === value ? [] : [value]
      if (prev.includes(value)) return prev.filter((v) => v !== value)
      if (prev.length >= KIND_SHAPE_LIMITS.maxHolders) return prev
      return [...prev, value]
    })
  const [tab, setTab] = useState<"members" | "clients">(shape.holder.members ? "members" : "clients")
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<DetailRow[]>(detailRowsForKind(shape, existing?.details))

  const setRow = (i: number, patch: Partial<DetailRow>) =>
    setRows((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((d) => [...d, { label: "", value: "" }])
  const removeRow = (i: number) => setRows((d) => d.filter((_, idx) => idx !== i))

  // Which labels this record's KIND asks for. Those rows keep their label — it
  // belongs to the kind, and editing it here would only rename it on this one
  // record while every other record kept the old name.
  const kindLabels = new Set(shape.fields.map((f) => f.label.toLowerCase()))
  const isFromKind = (label: string) => kindLabels.has(label.trim().toLowerCase())

  // A label typed twice would be silently deduped on save, and the second one's
  // value would vanish. Say so instead.
  const labelCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.label.trim().toLowerCase()
    if (k) acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
  const duplicated = (label: string) => (labelCounts[label.trim().toLowerCase()] ?? 0) > 1

  const membersQ = useQuery({
    queryKey: ["org-members-assignable"],
    queryFn: () => organizationsApi.getMembers({ limit: 100 }),
    enabled: open && shape.holder.enabled && shape.holder.members,
  })
  const members = (membersQ.data?.data ?? []).filter((m) => m.isActive && m.role !== "CUSTOMER")

  const clientsQ = useQuery({
    queryKey: ["space-clients", spaceId],
    queryFn: () => customersApi.list({ spaceId, limit: 100 }),
    enabled: open && shape.holder.enabled && shape.holder.clients,
  })
  const clients = clientsQ.data?.data ?? []

  const save = useMutation({
    mutationFn: () => {
      const base = {
        name: name.trim() || address.trim(),
        locationAddress: shape.hasAddress ? address : undefined,
        locationLat: shape.hasAddress ? lat ?? undefined : undefined,
        locationLng: shape.hasAddress ? lng ?? undefined : undefined,
        // Always sent, never omitted: an absent key means "leave them alone",
        // and an empty list means "nobody". Clearing the last resident has to
        // reach the server as a decision.
        holders: shape.holder.enabled
          ? holders.map((h) => (h.startsWith("u:") ? { userId: h.slice(2) } : { customerId: h.slice(2) }))
          : [],
        // Empty answers are kept, so a prompted field that nobody filled in
        // still shows as waiting rather than vanishing from the record.
        details: rows
          .filter((r) => r.label.trim())
          .map((r) => ({ label: r.label.trim(), value: r.value.trim() })),
      }
      return existing
        ? assetsApi.updateAsset(existing.id, base)
        : assetsApi.createAsset({ ...base, categoryId: kind.id })
    },
    onSuccess: () => {
      notify.success(existing ? t("common.saved", "Saved") : t("assetRecords.added", "Added"))
      onSaved()
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message || t("common.saveFailed", "Could not save")),
  })

  const reset = (next: boolean) => {
    if (next) {
      setName(existing?.name ?? "")
      setAddress(existing?.locationAddress ?? "")
      setLat(existing?.locationLat ?? null)
      setLng(existing?.locationLng ?? null)
      setHolders(encodeHolders(existing))
      setRows(detailRowsForKind(shape, existing?.details))
      setQ("")
    }
    setOpen(next)
  }

  const holderLabel = kindHolderLabel(shape, t("assetRecords.holder", "Held by"))
  const list = (tab === "members"
    ? members.map((m) => ({ value: `u:${m.id}`, name: memberName(m), sub: t("assetRecords.memberTag", "Member (staff)") }))
    : clients.map((c) => ({ value: `c:${c.id}`, name: c.name, sub: t("assetRecords.client", "Client") }))
  ).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const loadingList = tab === "members" ? membersQ.isLoading : clientsQ.isLoading

  /*
    A chosen person's name, from whichever side of the picker they came.

    Looked up across BOTH lists rather than the open tab: a flat can hold a
    member and a client at once, and a chip that read "Unknown" whenever the
    other tab was showing would be a bug nobody could explain.
  */
  const holderName = (value: string) => {
    if (value.startsWith("u:")) {
      const m = members.find((x) => x.id === value.slice(2))
      return m ? memberName(m) : t("assetRecords.formerMember", "Former member")
    }
    const c = clients.find((x) => x.id === value.slice(2))
    return c?.name ?? t("assetRecords.client", "Client")
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? t("assetRecords.editTitle", "Edit {{kind}}", { kind: kind.name })
              : t("assetRecords.newTitle", "Add to {{kind}}", { kind: kind.name })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{kindNameLabel(shape, t("assetRecords.name", "Name"))}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("assetRecords.namePh", "e.g. Apartment 4B")}
              autoFocus
            />
          </div>

          {shape.hasAddress && (
            <div className="space-y-1">
              <Label>{t("assetRecords.address", "Address")}</Label>
              <LocationPicker
                lat={lat} lng={lng} radius={0} address={address}
                onLocationChange={(la, ln) => { setLat(la); setLng(ln) }}
                onAddressChange={setAddress}
              />
            </div>
          )}

          {shape.holder.enabled && (
            <div className="space-y-1.5">
              <Label>{holderLabel}</Label>
              {/* Who is on it right now. Only when several are allowed: with one
                  holder the list below already shows the choice, and a chip
                  repeating it would just be the same fact twice. */}
              {shape.holder.multiple && holders.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {holders.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggleHolder(h)}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      {holderName(h)}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-border">
                <div className="flex items-center gap-1 border-b border-border p-1">
                  {shape.holder.members && (
                    <TabBtn active={tab === "members"} onClick={() => { setTab("members"); setQ("") }}
                      icon={User} label={t("assetRecords.members", "Members")} />
                  )}
                  {shape.holder.clients && (
                    <TabBtn active={tab === "clients"} onClick={() => { setTab("clients"); setQ("") }}
                      icon={Smartphone} label={t("assetRecords.clients", "Clients")} />
                  )}
                  <button type="button" onClick={() => setHolders([])}
                    className={cn("ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      holders.length === 0 ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                    <Ban className="h-3.5 w-3.5" /> {t("assetRecords.nobody", "Nobody")}
                  </button>
                </div>
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search", "Search…")}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                </div>
                <div className="max-h-52 overflow-y-auto p-1">
                  {loadingList ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">{t("common.loading", "Loading…")}</p>
                  ) : list.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      {tab === "clients"
                        ? t("assetRecords.noClients", "No clients in this space yet")
                        : t("assetRecords.noMembers", "No members to choose from")}
                    </p>
                  ) : list.map((r) => {
                    const sel = holders.includes(r.value)
                    return (
                      <button key={r.value} type="button" onClick={() => toggleHolder(r.value)}
                        className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                          sel ? "bg-primary/10" : "hover:bg-muted")}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {initials(r.name)}
                        </span>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("assetRecords.fields", "Details")}</Label>
              {/* Only when the kind allows it. Extras already on a record stay
                  editable either way — switching this off must not strand data
                  somebody can no longer correct. */}
              {shape.allowExtraFields && (
                <button
                  type="button"
                  onClick={addRow}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> {t("assetRecords.addField", "Add field")}
                </button>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {shape.allowExtraFields
                  ? t("assetRecords.fieldsHint", "Anything worth recording about this one.")
                  : t("assetRecords.noFields", "This kind records nothing extra.")}
              </p>
            ) : (
              rows.map((r, i) => {
                const fixed = isFromKind(r.label)
                const clash = !fixed && duplicated(r.label)
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2">
                      {fixed ? (
                        // From the kind: the label is the kind's, so it reads as
                        // a prompt rather than an editable box.
                        <span className="w-2/5 shrink-0 truncate text-sm text-muted-foreground">{r.label}</span>
                      ) : (
                        <Input
                          value={r.label}
                          onChange={(e) => setRow(i, { label: e.target.value })}
                          placeholder={t("assetRecords.fieldName", "Field name")}
                          className={cn("w-2/5", clash && "border-destructive")}
                        />
                      )}
                      <Input
                        value={r.value}
                        onChange={(e) => setRow(i, { value: e.target.value })}
                        placeholder={t("assetRecords.fieldValue", "What it says")}
                        className="flex-1"
                      />
                      {fixed ? (
                        // Keeps the row heights aligned without offering a
                        // delete that would not stick — the kind re-adds it.
                        <span className="w-[30px] shrink-0" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
                          aria-label={t("common.remove", "Remove")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {clash && (
                      <p className="text-[11px] text-destructive">
                        {t("assetRecords.duplicateField", "Already a field with this name — rename it or it will be dropped.")}
                      </p>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button
            disabled={(!name.trim() && !address.trim()) || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: typeof User; label: string
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
