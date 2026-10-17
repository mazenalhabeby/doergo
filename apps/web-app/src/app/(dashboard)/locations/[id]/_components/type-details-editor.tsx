"use client"

import { ArrowDownLeft, ArrowUpRight, Plus, Trash2 } from "lucide-react"
import { KIND_SHAPE_LIMITS, LOG_FIELD_TYPES, type LogFieldType } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChoiceOptionsEditor } from "./choice-options-editor"
import { fieldTypeLabel, DirBtn } from "./type-details-helpers"
import type { TypeDetailsState } from "./use-type-details"
import type { TypeDetails } from "./log-types-editor"

/** Part of TypeDetails's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TypeDetailsEditor({ vm, type, onChange }: { vm: TypeDetailsState; type: Parameters<typeof TypeDetails>[0]['type']; onChange: Parameters<typeof TypeDetails>[0]['onChange'] }) {
  const { t, setField, hasMoney, hasPhoto, due } = vm
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{t("assetLog.editor.fields", "What an entry asks for")}</Label>
        <button
          type="button"
          disabled={type.fields.length >= KIND_SHAPE_LIMITS.maxLogFields}
          onClick={() => onChange({ fields: [...type.fields, { key: "", label: "", type: "text", required: false }] })}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline"
        >
          <Plus className="h-3 w-3" /> {t("common.add", "Add")}
        </button>
      </div>
      <div className="mt-1.5 space-y-2">
        {type.fields.map((f, fi) => (
          <div key={fi} className="space-y-1.5 rounded-md bg-muted/40 p-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={f.label}
                onChange={(e) => setField(fi, { label: e.target.value })}
                placeholder={t("assetLog.editor.fieldPh", "Odometer")}
                maxLength={KIND_SHAPE_LIMITS.maxLabel}
                className="h-8 flex-1"
              />
              <select
                value={f.type}
                onChange={(e) => {
                  const next = e.target.value as LogFieldType
                  setField(fi, {
                    type: next,
                    unit: next === "number" ? f.unit : undefined,
                    meter: next === "number" ? f.meter : undefined,
                    options: next === "choice" ? f.options ?? [] : undefined,
                    direction: next === "money" ? f.direction ?? "out" : undefined,
                  })
                }}
                className="h-8 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
              >
                {LOG_FIELD_TYPES.map((ft) => (
                  <option
                    key={ft}
                    value={ft}
                    // One amount and one photo per entry: the columns an entry has.
                    disabled={(ft === "money" && hasMoney && f.type !== "money") || (ft === "photo" && hasPhoto && f.type !== "photo")}
                  >
                    {fieldTypeLabel(t, ft)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const fields = type.fields.filter((_, idx) => idx !== fi)
                  // A rule counting in a meter that is gone counts in nothing.
                  const lostMeter = !!f.key && due?.meterKey === f.key
                  onChange({ fields, ...(lostMeter ? { due: { ...due!, units: null, meterKey: null, leadUnits: null } } : {}) })
                }}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                aria-label={t("common.remove", "Remove")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-0.5 text-[11px] text-muted-foreground">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={f.required} onChange={(e) => setField(fi, { required: e.target.checked })} />
                {t("assetLog.editor.required", "Required")}
              </label>

              {f.type === "number" && (
                <>
                  <Input
                    value={f.unit ?? ""}
                    onChange={(e) => setField(fi, { unit: e.target.value || undefined })}
                    placeholder={t("assetLog.editor.unitPh", "km")}
                    maxLength={KIND_SHAPE_LIMITS.maxUnit}
                    className="h-7 w-20 text-xs"
                  />
                  <label className="inline-flex items-center gap-1.5" title={t("assetLog.editor.meterHint", "A counter the asset keeps, like mileage or operating hours. The record shows the latest one, and a due rule can count in it.")}>
                    <input type="checkbox" checked={!!f.meter} onChange={(e) => setField(fi, { meter: e.target.checked || undefined })} />
                    {t("assetLog.editor.meter", "It is a counter reading")}
                  </label>
                </>
              )}

              {f.type === "money" && (
                <div className="flex overflow-hidden rounded-md border border-border">
                  <DirBtn active={f.direction === "in"} onClick={() => setField(fi, { direction: "in" })} icon={ArrowDownLeft} label={t("assetKinds.moneyIn", "Money in")} />
                  <DirBtn active={f.direction !== "in"} onClick={() => setField(fi, { direction: "out" })} icon={ArrowUpRight} label={t("assetKinds.moneyOut", "Money out")} />
                </div>
              )}
            </div>

            {f.type === "choice" && (
              <ChoiceOptionsEditor value={f.options ?? []} onChange={(options) => setField(fi, { options })} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
