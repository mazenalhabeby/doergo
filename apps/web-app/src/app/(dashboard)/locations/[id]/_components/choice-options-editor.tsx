"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  CHOICE_LIMITS, addOptions, duplicateIndexes, moveOption, removeOption, renameOption, tidyOption,
  type AddRefusal,
} from "@/lib/choice-options"

/**
 * A choice field's options as a list: add, rename, reorder, remove.
 *
 * It replaced one comma-separated line, which could not hold an option with a
 * comma in it, could not be reordered without retyping, and hid a duplicate
 * until the save quietly dropped it. The stored shape is unchanged — a
 * `string[]` — and the rules are `@/lib/choice-options`, the normaliser's own.
 */
export function ChoiceOptionsEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")
  const [refused, setRefused] = useState<AddRefusal | null>(null)
  const dupes = duplicateIndexes(value)
  const full = value.length >= CHOICE_LIMITS.max

  const add = () => {
    const res = addOptions(value, draft)
    setRefused(res.refused === "empty" ? null : res.refused)
    if (res.list.length !== value.length) {
      onChange(res.list)
      setDraft("")
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t("assetLog.editor.options", "Options")}</span>
        <span className={cn(full && "text-amber-600")}>{value.length} / {CHOICE_LIMITS.max}</span>
      </div>

      {value.length === 0 && (
        <p className="text-[11px] text-muted-foreground/70">
          {t("assetLog.editor.optionsEmpty", "No options yet — until there is one, it saves as a text field.")}
        </p>
      )}

      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((o, i) => (
            // Index keys on purpose: the label IS what is being edited, and a key
            // that changed with every keystroke would remount the box under the cursor.
            <li key={i} className="flex items-center gap-1">
              <Input
                value={o}
                onChange={(e) => onChange(renameOption(value, i, e.target.value))}
                onBlur={() => {
                  const tidy = tidyOption(value, i)
                  if (tidy[i] !== value[i]) onChange(tidy)
                }}
                maxLength={CHOICE_LIMITS.maxLabel}
                aria-invalid={dupes.has(i) || undefined}
                aria-label={t("assetLog.editor.optionLabel", "Option {{n}}", { n: i + 1 })}
                className={cn("h-7 flex-1 text-xs", dupes.has(i) && "border-destructive focus-visible:ring-destructive")}
              />
              <button type="button" disabled={i === 0} onClick={() => onChange(moveOption(value, i, -1))} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={t("assetLog.editor.up", "Move up")}>
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={i === value.length - 1} onClick={() => onChange(moveOption(value, i, 1))} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={t("assetLog.editor.down", "Move down")}>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => onChange(removeOption(value, i))} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive" aria-label={t("common.remove", "Remove")}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {dupes.size > 0 && (
        <p className="text-[11px] text-destructive">
          {t("assetLog.editor.optionDuplicate", "Already in the list — only the first spelling is kept.")}
        </p>
      )}

      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setRefused(null) }}
          onKeyDown={(e) => {
            // Enter adds rather than submitting the whole kind dialog.
            if (e.key === "Enter") { e.preventDefault(); add() }
          }}
          disabled={full}
          placeholder={full
            ? t("assetLog.editor.optionsFull", "That is the most a choice can offer")
            : t("assetLog.editor.optionAddPh", "Add an option — paste a list to add several")}
          className="h-7 flex-1 text-xs"
        />
        <button
          type="button"
          onClick={add}
          disabled={full || !draft.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline"
        >
          <Plus className="h-3 w-3" /> {t("common.add", "Add")}
        </button>
      </div>
      {refused === "duplicate" && (
        <p className="text-[11px] text-destructive">{t("assetLog.editor.optionExists", "That one is already in the list.")}</p>
      )}
      {refused === "full" && (
        <p className="text-[11px] text-amber-600">{t("assetLog.editor.optionsFull", "That is the most a choice can offer")}</p>
      )}
    </div>
  )
}
