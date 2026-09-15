"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowDownLeft, ArrowUpRight, BookOpen, ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from "lucide-react"

import {
  KIND_SHAPE_LIMITS, LOG_COLORS, LOG_FIELD_TYPES, logKeyFrom,
  type KindLogDue, type KindLogField, type KindLogType, type LogFieldType,
} from "@hbcfield/shared/client"
import { LOG_COLOR_CLASSES } from "@/components/assets/log-style"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ChoiceOptionsEditor } from "./choice-options-editor"

/**
 * What gets DONE to one of these — Fuel, Oil change, Damage — and what each
 * entry asks for.
 *
 * ⚠️ KEYS ARE NEVER REWRITTEN HERE. An entry's answers are stored under the
 * field's key, so renaming "Mileage" to "Odometer" must keep the key the first
 * save gave it, or every entry already written would stop reading. A new type
 * or field arrives with an empty key and `normalizeLogTypes` makes one from its
 * label on save. The one exception is a due rule pointing at a meter nobody has
 * saved yet: the rule needs something to point at, so that field is stamped
 * with the key its label would get anyway.
 *
 * The rules that are not bounds (one amount and one photo per type; a unit rule
 * counts in a meter of the SAME type) are enforced by the shared normaliser on
 * save. They are ALSO enforced in the controls below, because a choice that is
 * offered and then silently dropped on save reads as the form losing work.
 */
export function LogTypesEditor({
  value,
  onChange,
  moneyEnabled,
}: {
  value: KindLogType[]
  onChange: (next: KindLogType[]) => void
  /** Whether the built-in Cost log exists — it is derived from the money headings. */
  moneyEnabled: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)

  const setType = (i: number, patch: Partial<KindLogType>) =>
    onChange(value.map((lt, idx) => (idx === i ? { ...lt, ...patch } : lt)))
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(next)
    if (open === i) setOpen(j)
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <BookOpen className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">{t("assetLog.editor.title", "Log types")}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("assetLog.editor.hint", "What gets done to each one — fuel, an oil change, damage — and what an entry asks for.")}
            </p>
            {moneyEnabled && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                {t("assetLog.editor.costHint", "Cost is always there: it uses the money headings below.")}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={value.length >= KIND_SHAPE_LIMITS.maxLogTypes}
          onClick={() => {
            onChange([...value, { key: "", label: "", color: "slate", fields: [], needsApproval: false, holderOnly: false, due: null }])
            setOpen(value.length)
          }}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline"
        >
          <Plus className="h-3.5 w-3.5" /> {t("common.add", "Add")}
        </button>
      </div>

      {value.map((lt, i) => (
        <div key={i} className="rounded-lg border border-border/70">
          <div className="flex items-center gap-1.5 p-2">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("assetLog.editor.expand", "Show details")}
            >
              {open === i ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", LOG_COLOR_CLASSES[lt.color].dot)} />
            <Input
              value={lt.label}
              onChange={(e) => setType(i, { label: e.target.value })}
              placeholder={t("assetLog.editor.typePh", "Oil change")}
              maxLength={KIND_SHAPE_LIMITS.maxLabel}
              className="h-8"
            />
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={t("assetLog.editor.up", "Move up")}>
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={t("assetLog.editor.down", "Move down")}>
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { onChange(value.filter((_, idx) => idx !== i)); setOpen(null) }}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
              aria-label={t("common.remove", "Remove")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {open === i && <TypeDetails type={lt} onChange={(patch) => setType(i, patch)} />}
        </div>
      ))}

      {value.some((lt) => lt.key) && (
        <p className="text-[11px] text-muted-foreground/70">
          {t("assetLog.editor.removeHint", "Removing a type keeps its entries — they stay on each record's logbook.")}
        </p>
      )}
    </div>
  )
}

function TypeDetails({ type, onChange }: { type: KindLogType; onChange: (patch: Partial<KindLogType>) => void }) {
  const { t } = useTranslation()

  const setField = (fi: number, patch: Partial<KindLogField>) =>
    onChange({ fields: type.fields.map((f, idx) => (idx === fi ? { ...f, ...patch } : f)) })
  const hasMoney = type.fields.some((f) => f.type === "money")
  const hasPhoto = type.fields.some((f) => f.type === "photo")
  const meters = type.fields.filter((f) => f.type === "number" && f.meter && f.label.trim())
  const due = type.due

  const setDue = (patch: Partial<KindLogDue> | null) =>
    onChange({
      due: patch === null ? null : {
        months: null, units: null, meterKey: null, leadDays: null, leadUnits: null,
        ...(due ?? {}),
        ...patch,
      },
    })

  /**
   * Point the rule at a meter. An unsaved meter has no key yet, so it gets the
   * one its label would get — written in the SAME change as the rule, or the
   * second update would be applied over a copy that never had the key.
   */
  const pointAtMeter = (fi: number) => {
    const f = type.fields[fi]!
    let key = f.key
    if (!key) {
      const taken = new Set(type.fields.map((x) => x.key).filter(Boolean))
      key = logKeyFrom(f.label)
      for (let n = 2; taken.has(key); n++) key = `${logKeyFrom(f.label)}_${n}`
    }
    onChange({
      fields: type.fields.map((x, idx) => (idx === fi ? { ...x, key } : x)),
      due: { months: null, units: null, leadDays: null, leadUnits: null, ...(due ?? {}), meterKey: key },
    })
  }

  const num = (v: string): number | null => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  return (
    <div className="space-y-3 border-t border-border/70 p-3">
      {/* Colour — a name from a fixed list, never a free value. */}
      <div>
        <Label className="text-[11px] text-muted-foreground">{t("assetLog.editor.color", "Colour")}</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {LOG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ color: c })}
              aria-label={c}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform",
                LOG_COLOR_CLASSES[c].dot,
                type.color === c ? "scale-110 border-foreground" : "border-transparent",
              )}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <FlagRow
          title={t("assetLog.editor.needsApproval", "Needs approval")}
          hint={t("assetLog.editor.needsApprovalHint", "An entry from a member waits for somebody who manages assets, and counts for nothing until then.")}
          checked={type.needsApproval}
          onChange={(v) => onChange({ needsApproval: v })}
        />
        <FlagRow
          title={t("assetLog.editor.holderOnly", "Only whoever had it that day")}
          hint={t("assetLog.editor.holderOnlyHint", "Off, anybody who can see it may log one — a colleague who noticed the dent.")}
          checked={type.holderOnly}
          onChange={(v) => onChange({ holderOnly: v })}
        />
      </div>

      {/* Fields */}
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

      {/* Next due */}
      <div className="rounded-md border border-border/70 p-2">
        <FlagRow
          title={t("assetLog.editor.due", "It comes due again")}
          hint={t("assetLog.editor.dueHint", "After some months or a meter reading, whichever comes first. Holders and whoever looks after it are reminded.")}
          checked={!!due}
          onChange={(v) => setDue(v ? { months: 12, leadDays: 30 } : null)}
        />
        {due && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">{t("assetLog.editor.months", "Every … months")}</Label>
              <Input type="number" min={1} max={120} value={due.months ?? ""} onChange={(e) => setDue({ months: num(e.target.value) })} className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">{t("assetLog.editor.leadDays", "Remind … days before")}</Label>
              <Input type="number" min={0} max={365} value={due.leadDays ?? ""} disabled={!due.months} onChange={(e) => setDue({ leadDays: num(e.target.value) })} className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">{t("assetLog.editor.units", "Or every …")}</Label>
              <div className="mt-1 flex gap-1.5">
                <Input type="number" min={1} value={due.units ?? ""} disabled={meters.length === 0} onChange={(e) => setDue({ units: num(e.target.value) })} className="h-8" />
                <select
                  value={due.meterKey ?? ""}
                  disabled={meters.length === 0}
                  onChange={(e) => {
                    const fi = type.fields.findIndex((f, idx) => (f.key || `#${idx}`) === e.target.value)
                    if (fi < 0) return setDue({ meterKey: null, units: null, leadUnits: null })
                    pointAtMeter(fi)
                  }}
                  className="h-8 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                >
                  <option value="">—</option>
                  {type.fields.map((f, idx) =>
                    f.type === "number" && f.meter && f.label.trim()
                      ? <option key={idx} value={f.key || `#${idx}`}>{f.unit || f.label}</option>
                      : null,
                  )}
                </select>
              </div>
              {meters.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  {t("assetLog.editor.noMeter", "Add a number field marked as a counter reading to count in it.")}
                </p>
              )}
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">{t("assetLog.editor.leadUnits", "Remind … before")}</Label>
              <Input type="number" min={0} value={due.leadUnits ?? ""} disabled={!due.units || !due.meterKey} onChange={(e) => setDue({ leadUnits: num(e.target.value) })} className="mt-1 h-8" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function fieldTypeLabel(t: (k: string, d: string) => string, ft: LogFieldType): string {
  switch (ft) {
    case "text": return t("assetLog.fieldType.text", "Text")
    case "number": return t("assetLog.fieldType.number", "Number")
    case "date": return t("assetLog.fieldType.date", "Date")
    case "choice": return t("assetLog.fieldType.choice", "Choice")
    case "photo": return t("assetLog.fieldType.photo", "Photo")
    case "money": return t("assetLog.fieldType.money", "Amount")
  }
}

function FlagRow({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function DirBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof ArrowDownLeft; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  )
}
