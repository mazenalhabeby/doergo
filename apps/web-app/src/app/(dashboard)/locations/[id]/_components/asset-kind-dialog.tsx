"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { ListPlus, Loader2, MapPin, Plus, Trash2, User } from "lucide-react"

import { assetsApi, type AssetCategory } from "@/lib/api"
import { normalizeKindShape, KIND_SHAPE_LIMITS, type KindShape } from "@hbcfield/shared/client"
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
  const [icon, setIcon] = useState(existing?.icon ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")
  const [shape, setShape] = useState<KindShape>(start)

  const set = <K extends keyof KindShape>(k: K, v: KindShape[K]) => setShape((s) => ({ ...s, [k]: v }))
  const setHolder = (patch: Partial<KindShape["holder"]>) =>
    setShape((s) => ({ ...s, holder: { ...s.holder, ...patch } }))
  const setField = (i: number, label: string) =>
    setShape((s) => ({ ...s, fields: s.fields.map((f, idx) => (idx === i ? { label } : f)) }))

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        icon: icon.trim() || undefined,
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
      setIcon(existing?.icon ?? "")
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
            {existing ? t("assetKinds.editTitle", "Edit kind") : t("assetKinds.newTitle", "New kind")}
          </DialogTitle>
          <DialogDescription>
            {t("assetKinds.hint", "Describe what one of these looks like. Adding them afterwards uses exactly what you set here.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* ── What it is ─────────────────────────────────────────────── */}
          <div className="flex gap-2">
            <div className="w-20">
              <Label className="text-xs text-muted-foreground">{t("assetKinds.icon", "Icon")}</Label>
              <Input className="mt-1" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏠" maxLength={4} />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">{t("assetKinds.name", "Name")}</Label>
              <Input
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("assetKinds.namePlaceholder", "Apartments")}
                autoFocus
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              {t("assetKinds.description", "Description")}{" "}
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
                <Plus className="h-3.5 w-3.5" /> {t("customers.addField", "Add field")}
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
