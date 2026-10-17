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
import { LogTypesEditor } from "./log-types-editor"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import { useAssetKindDialog } from "./use-asset-kind-dialog"
import { Row, Pick, DirBtn, OwnerBtn } from "./asset-kind-dialog-helpers"
import { AssetKindDialogLists } from "./asset-kind-dialog-lists"
import { AssetKindDialogHasHolder } from "./asset-kind-dialog-has-holder"
import { AssetKindDialogMoney } from "./asset-kind-dialog-money"

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
  const vm = useAssetKindDialog({ spaceId, existing, onSaved, trigger })
  const {
    t,
    open,
    setOpen,
    name,
    setName,
    description,
    setDescription,
    shape,
    setShape,
    set,
    setHolder,
    setField,
    setMoney,
    setList,
    setCategory,
    save,
    reset,
    atFieldCap,
  } = vm

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
                {t("assetKinds.templateHint", "Fills in the fields, the money, the tables and the log types. Change anything afterwards.")}
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
          <AssetKindDialogHasHolder vm={vm} />

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
          <AssetKindDialogLists vm={vm} />

          {/* Log types. What gets done to one of these, and when it comes due
              again. The body lives in its own file: a type carries fields, flags
              and a due rule, which is a form of its own. */}
          <LogTypesEditor
            value={shape.logTypes}
            onChange={(next) => set("logTypes", next)}
            moneyEnabled={shape.money.enabled}
          />

          {/* Money. The kind names the headings, so an Apartments kind logs Rent
              and Repairs while a Vehicles kind logs Fuel and Service — one
              ledger, different words. */}
          <AssetKindDialogMoney vm={vm} />
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
