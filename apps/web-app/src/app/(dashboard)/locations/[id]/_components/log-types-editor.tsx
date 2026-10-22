"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BookOpen, ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from "lucide-react"

import { KIND_SHAPE_LIMITS, type KindLogType } from "@hbcfield/shared/client"
import { LOG_COLOR_CLASSES } from "@/components/assets/log-style"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { TypeDetails } from "./log-type-details"

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
              {t(
                "assetLog.editor.hint",
                "What gets done to each one — fuel, an oil change, damage — and what an entry asks for.",
              )}
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
            onChange([
              ...value,
              { key: "", label: "", color: "slate", fields: [], needsApproval: false, holderOnly: false, due: null },
            ])
            setOpen(value.length)
          }}
          className={
            "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary " +
            "hover:underline disabled:opacity-40 disabled:no-underline"
          }
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
            <button
              type="button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              className={"shrink-0 rounded p-1 text-muted-foreground hover:text-foreground " + "disabled:opacity-30"}
              aria-label={t("assetLog.editor.up", "Move up")}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={i === value.length - 1}
              onClick={() => move(i, 1)}
              className={"shrink-0 rounded p-1 text-muted-foreground hover:text-foreground " + "disabled:opacity-30"}
              aria-label={t("assetLog.editor.down", "Move down")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(value.filter((_, idx) => idx !== i))
                setOpen(null)
              }}
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
