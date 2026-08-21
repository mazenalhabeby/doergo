"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { ArrowDownLeft, ArrowUpRight, ListPlus, Loader2, MapPin, Plus, Table2, Trash2, User, Wallet } from "lucide-react"

import { assetsApi, type AssetCategory } from "@/lib/api"
import {
  normalizeKindShape, KIND_SHAPE_LIMITS, KIND_TEMPLATES, keyColumn, linkTargets,
  type KindShape, type MoneyDirection, type KindColumn, type KindColumnType,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"

/**
 * Describe a kind of thing this space owns.
 *
 * An apartment record has a name, an address on a map, a resident, and a few
 * "more info" rows. Here you say which of those YOUR thing has and what each is
 * called — so Vehicles calls its holder "Driver" and has no address, and the
 * record form afterwards is built from exactly these answers.
 *
 * There are no presets: naming the thing is the entire point, and a chip that
 * fills the form in for you gets in the way of that.
 */
export function AssetKindDialog({
  spaceId,
  existing,
  onSaved,
  trigger,
}: {
  spaceId: string
  existing?: AssetCategory
  onSaved: () => void
  trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const start = normalizeKindShape(existing?.config)
  const [name, setName] = useState(existing?.name ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")
  const [shape, setShape] = useState<KindShape>(start)

  const set = <K extends keyof KindShape>(k: K, v: KindShape[K]) => setShape((s) => ({ ...s, [k]: v }))
  const setHolder = (patch: Partial<KindShape["holder"]>) =>
    setShape((s) => ({ ...s, holder: { ...s.holder, ...patch } }))
  const setField = (i: number, label: string) =>
    setShape((s) => ({ ...s, fields: s.fields.map((f, idx) => (idx === i ? { label } : f)) }))
  const setMoney = (patch: Partial<KindShape["money"]>) =>
    setShape((s) => ({ ...s, money: { ...s.money, ...patch } }))
  const setList = (i: number, patch: { label?: string; columns?: KindColumn[]; display?: "table" | "cards"; shared?: boolean }) =>
    setShape((s) => ({ ...s, lists: s.lists.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  const setCategory = (i: number, patch: { label?: string; direction?: MoneyDirection }) =>
    setShape((s) => ({
      ...s,
      money: {
        ...s.money,
        categories: s.money.categories.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
      },
    }))

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        description: description.trim() || undefined,
        config: normalizeKindShape(shape) as unknown as Record<string, unknown>,
      }
      return existing
        ? assetsApi.updateCategory(existing.id, input)
        : assetsApi.createCategory({ ...input, spaceId })
    },
    onSuccess: () => {
      notify.success(existing ? t("common.saved", "Saved") : t("assetKinds.created", "{{name}} added", { name: name.trim() }))
      onSaved()
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const reset = (next: boolean) => {
    if (next) {
      setName(existing?.name ?? "")
      setDescription(existing?.description ?? "")
      setShape(normalizeKindShape(existing?.config))
    }
    setOpen(next)
  }

  const atFieldCap = shape.fields.length >= KIND_SHAPE_LIMITS.maxFields

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existing ? t("assetKinds.editTitle", "Edit type") : t("assetKinds.newTitle", "New asset type")}
          </DialogTitle>
          <DialogDescription>
            {t("assetKinds.hint", "Describe what one of these looks like. Adding them afterwards uses exactly what you set here.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Ready-made kinds. Copied in, then yours: everything below stays
              editable, and nothing links back. Only offered when creating —
              stamping a template over a kind that already has records would
              silently rewrite what those records are. */}
          {!existing && (
            <div>
              <Label className="text-xs text-muted-foreground">
                {t("assetKinds.template", "Start from a ready-made type")}
              </Label>
              <p className="mb-1.5 text-[11px] text-muted-foreground/70">
                {t("assetKinds.templateHint", "Fills in the fields, the money and the tables. Change anything afterwards.")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {KIND_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    title={tpl.description}
                    onClick={() => {
                      setShape(normalizeKindShape(tpl.shape))
                      // Only name an unnamed kind: somebody who typed "Presses"
                      // then picked Machine meant the shape, not the name.
                      setName((n) => n.trim() || tpl.name)
                      if (!description.trim()) setDescription(tpl.description)
                    }}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── What it is ─────────────────────────────────────────────── */}
          <div>
            <Label className="text-xs text-muted-foreground">{t("assetKinds.name", "Type name")}</Label>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("assetKinds.namePlaceholder", "Apartments")}
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              {t("assetKinds.description", "What this type is for")}{" "}
              <span className="text-muted-foreground/60">{t("common.optional", "(optional)")}</span>
            </Label>
            <Input
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("assetKinds.descriptionPlaceholder", "The flats we rent out")}
            />
          </div>

          <div className="h-px bg-border" />

          {/* ── What one of them has ───────────────────────────────────── */}
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("assetKinds.shapeTitle", "What one of them has")}
          </p>

          <div>
            <Label className="text-xs text-muted-foreground">
              {t("assetKinds.nameLabel", "Call the name field")}
            </Label>
            <Input
              className="mt-1"
              value={shape.nameLabel}
              onChange={(e) => set("nameLabel", e.target.value)}
              placeholder={t("assetKinds.nameLabelPlaceholder", "Name / number")}
              maxLength={KIND_SHAPE_LIMITS.maxLabel}
            />
          </div>

          {/* Address → the record gets the same map an apartment has. */}
          <Row
            icon={MapPin}
            title={t("assetKinds.hasAddress", "It has an address")}
            hint={t("assetKinds.hasAddressHint", "Adds an address box and a map to every one of them.")}
            checked={shape.hasAddress}
            onChange={(v) => set("hasAddress", v)}
          />

          {/* Holder → the apartment "resident", renamed to whatever this is. */}
          <div className="rounded-xl border border-border">
            <Row
              icon={User}
              title={t("assetKinds.hasHolder", "Someone can have it")}
              hint={t("assetKinds.hasHolderHint", "A member or a client is assigned to it — a resident, a driver, an operator.")}
              checked={shape.holder.enabled}
              onChange={(v) => setHolder({ enabled: v })}
              bare
            />
            {shape.holder.enabled && (
              <div className="space-y-3 border-t border-border p-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t("assetKinds.holderLabel", "Call that person")}
                  </Label>
                  <Input
                    className="mt-1"
                    value={shape.holder.label}
                    onChange={(e) => setHolder({ label: e.target.value })}
                    placeholder={t("assetKinds.holderLabelPlaceholder", "Resident")}
                    maxLength={KIND_SHAPE_LIMITS.maxHolderLabel}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t("assetKinds.holderWho", "Who can be one")}
                  </Label>
                  <div className="mt-1.5 flex gap-2">
                    <Pick
                      label={t("assetKinds.members", "Members")}
                      active={shape.holder.members}
                      onClick={() => setHolder({ members: !shape.holder.members })}
                    />
                    <Pick
                      label={t("assetKinds.clients", "Clients")}
                      active={shape.holder.clients}
                      onClick={() => setHolder({ clients: !shape.holder.clients })}
                    />
                  </div>
                </div>
                {/* Phrased against the switch above it — "Someone can have it",
                    then "How many can have it". "How many at a time" read like a
                    rate limit: it never said what was being counted.

                    Two named choices rather than a toggle, because "just one"
                    and "more than one" are both real answers; a switch labelled
                    "multiple" makes its off state look like a decision nobody
                    made. */}
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t("assetKinds.holderCount", "How many can have it")}
                  </Label>
                  <div className="mt-1.5 flex gap-2">
                    <Pick
                      label={t("assetKinds.holderOne", "Just one")}
                      active={!shape.holder.multiple}
                      onClick={() => setHolder({ multiple: false })}
                    />
                    <Pick
                      label={t("assetKinds.holderSeveral", "More than one")}
                      active={shape.holder.multiple}
                      onClick={() => setHolder({ multiple: true })}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {shape.holder.multiple
                      ? t("assetKinds.holderSeveralHint", "A shared flat, a shift of operators — records can list more than one.")
                      : t("assetKinds.holderOneHint", "One van, one driver. Assigning someone new replaces whoever is there.")}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* More info → the fields every record is prompted for. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">
                  {t("assetKinds.fields", "What you record about each one")}
                </Label>
                <p className="text-[11px] text-muted-foreground/70">
                  {t("assetKinds.fieldsHint", "Floor, rooms, rent, plate, serial — whatever this kind needs.")}
                </p>
              </div>
              <button
                type="button"
                disabled={atFieldCap}
                onClick={() => set("fields", [...shape.fields, { label: "" }])}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline"
              >
                <Plus className="h-3.5 w-3.5" /> {t("assetRecords.addField", "Add field")}
              </button>
            </div>

            {shape.fields.length > 0 && (
              <div className="space-y-2">
                {shape.fields.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={f.label}
                      onChange={(e) => setField(i, e.target.value)}
                      placeholder={t("assetKinds.fieldLabel", "Floor")}
                      maxLength={KIND_SHAPE_LIMITS.maxLabel}
                    />
                    <button
                      type="button"
                      onClick={() => set("fields", shape.fields.filter((_, idx) => idx !== i))}
                      className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
                      aria-label={t("common.remove", "Remove")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Whether a single record may carry a field this kind never asked
              for. Off keeps every record of the kind identical, which is what
              you want when the data gets compared or exported. */}
          <Row
            icon={ListPlus}
            title={t("assetKinds.allowExtra", "Allow extra fields on a record")}
            hint={t("assetKinds.allowExtraHint", "Off, every one of them holds exactly the fields above — nothing more.")}
            checked={shape.allowExtraFields}
            onChange={(v) => set("allowExtraFields", v)}
          />

          {/* Tables. A field answers "what is this one's floor"; a list answers
              "what is in it" — a machine's parts, an apartment's keys — which
              needs rows, not a value. */}
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Table2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("assetKinds.lists", "Tables on each one")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("assetKinds.listsHint", "A parts catalogue, a set of keys — a table with as many rows as it needs.")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={shape.lists.length >= KIND_SHAPE_LIMITS.maxLists}
                onClick={() => set("lists", [...shape.lists, { label: "", columns: [{ label: "", type: "text" as const }], display: "table" as const, shared: false }])}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline"
              >
                <Plus className="h-3.5 w-3.5" /> {t("common.add", "Add")}
              </button>
            </div>

            {shape.lists.map((list, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border/70 p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={list.label}
                    onChange={(e) => setList(i, { label: e.target.value })}
                    placeholder={t("assetKinds.listName", "Parts")}
                    maxLength={KIND_SHAPE_LIMITS.maxLabel}
                  />
                  {/* How the rows read. A display choice — nothing about what
                      the table MEANS, which the columns decide. */}
                  <select
                    value={list.display}
                    onChange={(e) => setList(i, { display: e.target.value as "table" | "cards" })}
                    className="h-9 shrink-0 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  >
                    <option value="table">{t("assetKinds.displayTable", "As a grid")}</option>
                    <option value="cards">{t("assetKinds.displayCards", "As cards")}</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => set("lists", shape.lists.filter((_, idx) => idx !== i))}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
                    aria-label={t("common.remove", "Remove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Typed once for the kind, or filled in per record. A parts
                    catalogue is the same on every machine of a model; a set of
                    keys belongs to one flat. */}
                <div className="flex gap-2 pl-1">
                  <OwnerBtn
                    active={list.shared}
                    onClick={() => setList(i, { shared: true })}
                    label={t("assetKinds.sharedOn", "Same for every one")}
                  />
                  <OwnerBtn
                    active={!list.shared}
                    onClick={() => setList(i, { shared: false })}
                    label={t("assetKinds.sharedOff", "Different on each")}
                  />
                </div>

                <div className="pl-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">
                      {t("assetKinds.listColumns", "Columns in this table")}
                    </Label>
                    <button
                      type="button"
                      disabled={list.columns.length >= KIND_SHAPE_LIMITS.maxColumns}
                      onClick={() => setList(i, { columns: [...list.columns, { label: "", type: "text" as const }] })}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      <Plus className="h-3 w-3" /> {t("common.add", "Add")}
                    </button>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {list.columns.map((col, ci) => {
                      const setCol = (patch: Partial<KindColumn>) =>
                        setList(i, {
                          columns: list.columns.map((c, idx) =>
                            idx === ci ? { ...c, ...patch } : c,
                          ) as KindColumn[],
                        })
                      const targets = linkTargets(shape, list)
                      return (
                        <div key={ci} className="flex items-center gap-1.5">
                          <Input
                            value={col.label}
                            onChange={(e) => setCol({ label: e.target.value })}
                            placeholder={t("assetKinds.listColumn", "Code")}
                            className="h-8 flex-1"
                            maxLength={KIND_SHAPE_LIMITS.maxLabel}
                          />
                          {/* What the column IS. A key makes rows of this table
                              referenceable; a link points at another table's
                              keys and is picked, not typed. */}
                          <select
                            value={col.type}
                            onChange={(e) => {
                              const type = e.target.value as KindColumnType
                              setCol({
                                type,
                                linkTo: type === "link" ? col.linkTo ?? targets[0]?.label : undefined,
                              })
                            }}
                            className="h-8 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                          >
                            <option value="text">{t("assetKinds.colText", "Plain text")}</option>
                            <option value="key">{t("assetKinds.colKey", "Code (identifies the row)")}</option>
                            <option value="link" disabled={targets.length === 0}>
                              {t("assetKinds.colLink", "Points at another table")}
                            </option>
                          </select>
                          {col.type === "link" && (
                            <select
                              value={col.linkTo ?? ""}
                              onChange={(e) => setCol({ linkTo: e.target.value })}
                              className="h-8 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                            >
                              {targets.map((tl) => (
                                <option key={tl.label} value={tl.label}>{tl.label}</option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() => setList(i, { columns: list.columns.filter((_, idx) => idx !== ci) })}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                            aria-label={t("common.remove", "Remove")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  {!keyColumn(list) && (
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {t("assetKinds.noKeyHint", "No column marked as the code — other tables cannot point at this one.")}
                    </p>
                  )}
                  {list.columns.filter((c) => c.label.trim()).length === 0 && (
                    <p className="mt-1 text-[11px] text-destructive">
                      {t("assetKinds.listNeedsColumn", "A table needs at least one column, or it is dropped.")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Money. The kind names the headings, so an Apartments kind logs Rent
              and Repairs while a Vehicles kind logs Fuel and Service — one
              ledger, different words. */}
          <div className="rounded-xl border border-border">
            <Row
              icon={Wallet}
              title={t("assetKinds.money", "It costs or earns money")}
              hint={t("assetKinds.moneyHint", "Log what comes in and what goes out, with dates and a running total.")}
              checked={shape.money.enabled}
              onChange={(v) => setMoney({ enabled: v })}
              bare
            />
            {shape.money.enabled && (
              <div className="space-y-2 border-t border-border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {t("assetKinds.moneyCategories", "What money gets logged under")}
                    </Label>
                    <p className="text-[11px] text-muted-foreground/70">
                      {t("assetKinds.moneyCategoriesHint", "Rent, Repairs, Utilities — or Fuel, Service, Insurance.")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={shape.money.categories.length >= KIND_SHAPE_LIMITS.maxMoneyCategories}
                    onClick={() => setMoney({ categories: [...shape.money.categories, { label: "", direction: "out" }] })}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t("common.add", "Add")}
                  </button>
                </div>

                {shape.money.categories.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={c.label}
                      onChange={(e) => setCategory(i, { label: e.target.value })}
                      placeholder={t("assetKinds.moneyCategoryPh", "Rent")}
                      maxLength={KIND_SHAPE_LIMITS.maxLabel}
                    />
                    {/* In or out is a property of the heading, not of each entry:
                        rent is always money in, a repair is always money out. */}
                    <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                      <DirBtn
                        active={c.direction === "in"}
                        onClick={() => setCategory(i, { direction: "in" })}
                        icon={ArrowDownLeft}
                        label={t("assetKinds.moneyIn", "Money in")}
                        tone="in"
                      />
                      <DirBtn
                        active={c.direction === "out"}
                        onClick={() => setCategory(i, { direction: "out" })}
                        icon={ArrowUpRight}
                        label={t("assetKinds.moneyOut", "Money out")}
                        tone="out"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setMoney({ categories: shape.money.categories.filter((_, idx) => idx !== i) })}
                      className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
                      aria-label={t("common.remove", "Remove")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existing ? t("common.save", "Save") : t("common.create", "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One switchable part of the record. */
function Row({
  icon: Icon, title, hint, checked, onChange, bare,
}: {
  icon: typeof MapPin
  title: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
  bare?: boolean
}) {
  return (
    <div className={cn("flex items-start gap-3 p-3", !bare && "rounded-xl border border-border")}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/** A two-state chip — members, clients, or both. */
function Pick({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}

/** In or out, for one money heading. */
function DirBtn({
  active, onClick, icon: Icon, label, tone,
}: {
  active: boolean
  onClick: () => void
  icon: typeof ArrowDownLeft
  label: string
  tone: "in" | "out"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors",
        active
          ? tone === "in"
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

/** Typed once for the kind, or filled in per record. */
function OwnerBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}
