"use client"

import { useTranslation } from "react-i18next"
import { STEP_FORM_PRESET_IDS, type StepFormPresetId } from "@hbcfield/shared/client"
import { askNothingDraft, presetDraft } from "@/lib/step-forms"
import type { StepFormEditorProps } from "./step-form-editor"

const PRESET_NAME: Record<StepFormPresetId, string> = {
  fieldService: "Field service",
  salesVisit: "Sales visit",
  delivery: "Delivery",
  inspection: "Inspection",
  support: "Support",
}

/** "Start from": replace the list with a preset, with nothing, or (when offered) the standard report. */
export function StepFormPresets({
  onChange,
  standardAvailable,
}: Pick<StepFormEditorProps, "onChange" | "standardAvailable">) {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <span>{t("stepForm.startFrom", "Start from")}:</span>
      {STEP_FORM_PRESET_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(presetDraft(id, tr))}
          className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
        >
          {t(`stepForm.preset.${id}`, PRESET_NAME[id])}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(askNothingDraft())}
        className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
      >
        {t("stepForm.preset.nothing", "Nothing")}
      </button>
      {standardAvailable && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("stepForm.legacy.backToStandard", "Use the standard report again")}
        </button>
      )}
    </div>
  )
}
