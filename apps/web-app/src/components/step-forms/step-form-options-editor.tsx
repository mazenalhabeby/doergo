"use client"

import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, CircleDot, Plus, X } from "lucide-react"
import { STEP_FORM_LIMITS } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { moveField } from "@/lib/step-forms"

/** A choice's options: add, remove, reorder. Two to twelve. */
export function OptionsEditor({
  options,
  editable,
  onChange,
}: {
  options: string[]
  editable: boolean
  onChange: (o: string[]) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1 pl-6">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-1">
          <CircleDot className="size-3 shrink-0 text-muted-foreground" />
          {editable ? (
            <Input
              value={o}
              onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={STEP_FORM_LIMITS.maxOptionLength + 10}
              placeholder={t("stepForm.optionPlaceholder", "Option")}
              aria-label={t("stepForm.optionPlaceholder", "Option")}
              className="h-6 flex-1 text-[11px]"
            />
          ) : (
            <span className="text-[11px]">{o}</span>
          )}
          {editable && (
            <>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => onChange(moveField(options, i, i - 1))}
                aria-label={t("stepForm.moveUp", "Move up")}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-3" />
              </button>
              <button
                type="button"
                disabled={i === options.length - 1}
                onClick={() => onChange(moveField(options, i, i + 1))}
                aria-label={t("stepForm.moveDown", "Move down")}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-3" />
              </button>
              <button
                type="button"
                disabled={options.length <= 2}
                onClick={() => onChange(options.filter((_, j) => j !== i))}
                aria-label={t("stepForm.removeOption", "Remove option")}
                className="p-0.5 text-muted-foreground hover:text-red-500 disabled:opacity-30"
              >
                <X className="size-3" />
              </button>
            </>
          )}
        </div>
      ))}
      {editable && options.length < STEP_FORM_LIMITS.maxOptions && (
        <button
          type="button"
          onClick={() => onChange([...options, ""])}
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <Plus className="size-3" />
          {t("stepForm.addOption", "Add option")}
        </button>
      )}
    </div>
  )
}
