"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Building2, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"

import { assetsApi, locationsApi, type AssetCategory } from "@/lib/api"
import { HolderPicker, decodeHolders, encodeHolderList, type HolderKey } from "./holder-picker"
import { fieldsDroppedByMove } from "@hbcfield/shared/client"
import {
  normalizeKindShape, detailRowsForKind, kindHolderLabel, kindNameLabel,
  KIND_SHAPE_LIMITS, type DetailRow,
  ASSET_RECORD_LIMITS, assetDateProblems, type AssetStatusKey,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AssetStatusPicker, asStatus } from "./asset-status"
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
  status?: string | null
  manufacturer?: string | null
  model?: string | null
  installDate?: string | null
  warrantyExpiry?: string | null
  notes?: string | null
  _count?: { tasks?: number }
}

/** A stored date -> what `<input type="date">` holds. */
const dayOf = (v?: string | null) => (v ? v.slice(0, 10) : "")

/** The plate as the form holds it: every fact a string, empty meaning unset. */
const factsOf = (r?: AssetRecord) => ({
  serialNumber: r?.serialNumber ?? "",
  manufacturer: r?.manufacturer ?? "",
  model: r?.model ?? "",
  installDate: dayOf(r?.installDate),
  warrantyExpiry: dayOf(r?.warrantyExpiry),
  notes: r?.notes ?? "",
})
type Facts = ReturnType<typeof factsOf>

const hasFacts = (f: Facts) => Object.values(f).some((v) => v.trim() !== "")

/**
 * What a save sends for the plate.
 *
 * An emptied box is sent as null, not "": null clears the fact, while an empty
 * string stored in its place reads as "has a serial number, and it is blank".
 * On a new record an empty box is simply not sent.
 */
export function factsPayload(facts: Facts, editing: boolean): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const key of Object.keys(facts) as Array<keyof Facts>) {
    const value = facts[key].trim()
    if (value) out[key] = value
    else if (editing) out[key] = null
  }
  return out
}

/*
  A holder is one string: "u:<userId>" or "c:<customerId>".

  One encoding for both sides keeps selection a set-membership test instead of
  two parallel lists that can disagree about who is chosen — and makes the
  single case a list of length one rather than a separate code path.
*/
const encodeHolders = (r?: AssetRecord): HolderKey[] => {
  if (r?.holders?.length) return encodeHolderList(r.holders)
  // A record saved before types could hold several still answers the old way.
  if (r?.holderUserId) return [`u:${r.holderUserId}`]
  if (r?.customerId) return [`c:${r.customerId}`]
  return []
}

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

  /*
    Which workspace this record lives in.

    ⚠️ An asset has no workspace of its own — it inherits its KIND's
    (`AssetCategory.spaceId`), so the answer was only ever implied by which tab
    somebody happened to be on. Two workspaces can both have a kind called
    "Vehicles", and nothing in this dialog said which one was about to receive
    the record.

    Read from the list the nav and the space tabs already fetched, so saying so
    costs nothing.
  */
  const spacesQ = useQuery({
    queryKey: ["locations", "list"],
    queryFn: () => locationsApi.list({ limit: 200 }),
    staleTime: 60_000,
    enabled: open && !!spaceId,
  })
  const spaces = ((spacesQ.data as { data?: Array<{ id: string; name: string; enabledModules?: unknown }> } | undefined)?.data ?? [])
  const spaceName = spaces.find((sp) => sp.id === spaceId)?.name

  /*
    Moving the record to another workspace.

    An asset has no workspace of its own — it inherits its KIND's — so a move is
    a change of kind, and the kind decides which of the record's fields survive
    it. That is why this is not a workspace dropdown: choosing "Warehouse" alone
    would not say what the record becomes when it gets there.
  */
  const [moving, setMoving] = useState(false)
  const [destSpace, setDestSpace] = useState("")
  const [destKind, setDestKind] = useState("")

  const destKindsQ = useQuery({
    queryKey: ["asset-categories", destSpace],
    queryFn: () => assetsApi.getCategories(destSpace),
    enabled: open && moving && !!destSpace,
  })
  const destKinds = ((destKindsQ.data ?? []) as AssetCategory[]).filter((k) => k.id !== kind.id)
  const chosenKind = destKinds.find((k) => k.id === destKind)

  /*
    What the move throws away, named before anybody agrees to it.

    The same function the server uses to decide what to keep, read the other way
    round — so the sentence on screen and the rows actually deleted cannot
    disagree.
  */
  const dropped = chosenKind ? fieldsDroppedByMove(existing?.details, chosenKind.config) : []

  const [name, setName] = useState(existing?.name ?? "")
  const [address, setAddress] = useState(existing?.locationAddress ?? "")
  const [lat, setLat] = useState<number | null>(existing?.locationLat ?? null)
  const [lng, setLng] = useState<number | null>(existing?.locationLng ?? null)
  const [holders, setHolders] = useState<string[]>(encodeHolders(existing))
  const [status, setStatus] = useState<AssetStatusKey>(asStatus(existing?.status))
  const [facts, setFacts] = useState<Facts>(factsOf(existing))
  /*
    "More about it" opens by itself when there is something in it. Closed on a
    record that has a serial number would hide the one fact somebody opened the
    form to correct.
  */
  const [moreOpen, setMoreOpen] = useState(hasFacts(factsOf(existing)))
  const setFact = (key: keyof Facts, value: string) => setFacts((f) => ({ ...f, [key]: value }))
  // The same rule the server refuses on, asked while the dates are being typed.
  const dateProblems = assetDateProblems({ installDate: facts.installDate, warrantyExpiry: facts.warrantyExpiry })

  /*
    Picking somebody.

    On a "one at a time" type a click REPLACES, which is what a single choice
    means and saves a deselect-then-select every time somebody moves a van to a
    new driver. On a "several" type it toggles, and the cap is the same one the
    server enforces — reached here it just stops adding rather than letting
    somebody build a list that will be refused on save.
  */
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
        holders: shape.holder.enabled ? decodeHolders(holders) : [],
        // Empty answers are kept, so a prompted field that nobody filled in
        // still shows as waiting rather than vanishing from the record.
        details: rows
          .filter((r) => r.label.trim())
          .map((r) => ({ label: r.label.trim(), value: r.value.trim() })),
        status,
        ...factsPayload(facts, !!existing),
      }
      return existing
        // A move is a change of kind; the server drops the fields the
        // destination does not ask for, which is what `dropped` warned about.
        ? assetsApi.updateAsset(existing.id, { ...base, ...(moving && destKind ? { categoryId: destKind } : {}) })
        /*
          `spaceId` is sent for the MODULE GATE, not stored — an asset inherits
          its space from its kind, and at creation there is no asset yet for the
          guard to ask. Without it the gate falls back to the ORGANIZATION's
          modules and refuses "assets is not switched on" to an org that runs
          assets in one workspace, which is the normal way to run them.
        */
        : assetsApi.createAsset({ ...base, categoryId: kind.id, spaceId })
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
      setStatus(asStatus(existing?.status))
      setFacts(factsOf(existing))
      setMoreOpen(hasFacts(factsOf(existing)))
    }
    setOpen(next)
  }

  const holderLabel = kindHolderLabel(shape, t("assetRecords.holder", "Held by"))

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
          {/*
            Said, not asked. The workspace is decided by the kind and cannot be
            chosen here — an asset moves between workspaces only by moving to a
            kind in another one, which changes its type and the fields that come
            with it. What this fixes is that it was not stated at all.
          */}
          {spaceName && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {existing
                ? t("assetRecords.inWorkspace", "In {{name}}", { name: spaceName })
                : t("assetRecords.toWorkspace", "Added to {{name}}", { name: spaceName })}
            </p>
          )}
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
              {/* The same picker the handover dialog uses. Two copies of a
                  control that enforces a kind's rules is how a single-holder van
                  ends up with two drivers on one screen and one on the other. */}
              <HolderPicker
                shape={shape}
                spaceId={spaceId}
                value={holders}
                onChange={setHolders}
                enabled={open}
                showChips={shape.holder.multiple}
              />
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

        {/*
          The record's state. After the fields somebody came to fill in, and
          before the rarely-touched facts: changing it is common enough to be in
          view, and consequential enough not to be the first control.
        */}
        <div className="mt-3 space-y-1.5">
          <Label>{t("assetFacts.status.label", "Status")}</Label>
          <AssetStatusPicker value={status} onChange={setStatus} />
        </div>

        {/*
          More about it: the plate.

          Serial, maker, model, the two dates and notes existed on every record
          with nothing to write them. Behind a fold because most kinds never
          need them, and a van's form should not open on a warranty date.
        */}
        <div className="mt-3 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {moreOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {t("assetFacts.more.title", "More about it")}
          </button>
          {moreOpen && (
            <div className="grid gap-2.5 border-t border-border p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("assetFacts.more.serial", "Serial number")}</Label>
                <Input value={facts.serialNumber} maxLength={ASSET_RECORD_LIMITS.serialNumber} onChange={(e) => setFact("serialNumber", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("assetFacts.more.manufacturer", "Manufacturer")}</Label>
                <Input value={facts.manufacturer} maxLength={ASSET_RECORD_LIMITS.manufacturer} onChange={(e) => setFact("manufacturer", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("assetFacts.more.model", "Model")}</Label>
                <Input value={facts.model} maxLength={ASSET_RECORD_LIMITS.model} onChange={(e) => setFact("model", e.target.value)} />
              </div>
              <div className="hidden sm:block" />
              <div className="space-y-1">
                <Label className="text-xs">{t("assetFacts.more.installDate", "Installed on")}</Label>
                <Input type="date" value={facts.installDate} onChange={(e) => setFact("installDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("assetFacts.more.warrantyExpiry", "Warranty until")}</Label>
                <Input
                  type="date"
                  value={facts.warrantyExpiry}
                  min={facts.installDate || undefined}
                  onChange={(e) => setFact("warrantyExpiry", e.target.value)}
                  className={cn(dateProblems.length > 0 && "border-destructive")}
                />
              </div>
              {dateProblems.length > 0 && (
                <p className="text-[11px] text-destructive sm:col-span-2">
                  {dateProblems.includes("warranty-before-install")
                    ? t("assetFacts.dates.warrantyBeforeInstall", "The warranty cannot end before the date it was installed.")
                    : t("assetFacts.dates.invalid", "That date could not be read.")}
                </p>
              )}
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{t("assetFacts.more.notes", "Notes")}</Label>
                <Textarea
                  value={facts.notes}
                  maxLength={ASSET_RECORD_LIMITS.notes}
                  onChange={(e) => setFact("notes", e.target.value)}
                  placeholder={t("assetFacts.more.notesPh", "Anything worth knowing — where it came from, what to watch for…")}
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>

        {/*
          Moving it somewhere else.

          At the bottom, behind a link, and never open by default: it is the one
          control here that changes what the record IS, and it has no business
          sitting among the fields somebody came to correct a serial number in.
        */}
        {existing && (
          <div className="mt-3 border-t border-border pt-3">
            {!moving ? (
              <button
                type="button"
                onClick={() => setMoving(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Building2 className="h-3.5 w-3.5" />
                {t("assetRecords.move", "Move to another workspace")}
              </button>
            ) : (
              <div className="space-y-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold">{t("assetRecords.moveTitle", "Move to another workspace")}</p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    value={destSpace}
                    onChange={(e) => { setDestSpace(e.target.value); setDestKind("") }}
                    className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                  >
                    <option value="">{t("assetRecords.moveSpace", "Workspace…")}</option>
                    {spaces.filter((sp) => sp.id !== spaceId).map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.name}</option>
                    ))}
                  </select>
                  {/*
                    The kind, not just the workspace: the record has to become
                    something when it arrives, and the kind is what it becomes.
                  */}
                  <select
                    value={destKind}
                    onChange={(e) => setDestKind(e.target.value)}
                    disabled={!destSpace || destKindsQ.isLoading}
                    className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm disabled:opacity-50"
                  >
                    <option value="">{t("assetRecords.moveKind", "Kind…")}</option>
                    {destKinds.map((k) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>

                {destSpace && !destKindsQ.isLoading && destKinds.length === 0 && (
                  <p className="text-[11.5px] text-muted-foreground">
                    {t("assetRecords.moveNoKinds", "That workspace has no asset kinds yet.")}
                  </p>
                )}

                {/* Named, one by one. A count would not tell anybody whether the
                    thing they care about is in it. */}
                {dropped.length > 0 && (
                  <p className="text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-400">
                    {t("assetRecords.moveDrops", "{{kind}} does not have these fields, and they will be deleted:", { kind: chosenKind?.name ?? "" })}{" "}
                    <b>{dropped.join(", ")}</b>
                  </p>
                )}
                {chosenKind && dropped.length === 0 && (
                  <p className="text-[11.5px] text-muted-foreground">
                    {t("assetRecords.moveKeeps", "Every field on this record exists in {{kind}} — nothing is lost.", { kind: chosenKind.name })}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => { setMoving(false); setDestSpace(""); setDestKind("") }}
                  className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {t("common.cancel", "Cancel")}
                </button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button
            disabled={(!name.trim() && !address.trim()) || dateProblems.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

