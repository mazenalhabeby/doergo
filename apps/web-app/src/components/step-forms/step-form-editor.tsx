"use client"

import { FileText } from "lucide-react"
import { useTranslation } from "react-i18next"

import { askNothingDraft, presetDraft, type DefinitionErrors, type StepFormDraft } from "@/lib/step-forms"
import { StepFormPreview } from "./step-form-preview"
import { StepFormFieldList } from "./step-form-field-list"

export interface StepFormEditorProps {
  /** The step's name, for the preview. */
  stepName: string
  /** What the step asks as it stands: its own list, the standard report, or nothing. */
  mode: "own" | "legacy" | "none"
  draft: StepFormDraft
  onChange: (draft: StepFormDraft) => void
  /** May this person change it? Otherwise it is shown, not edited. */
  editable: boolean
  /** Does the space (else the organization) run the CRM? Offers the CRM links. */
  crmAvailable: boolean
  /** What the server refused on the last save, by field. */
  serverErrors?: DefinitionErrors
  /** Without its own list this step would ask the standard report — offer the way back to it. */
  standardAvailable?: boolean
}

/**
 * "Ask when a job moves here" — one step's list of questions.
 *
 * The same shape as the approved mockup: Start from a preset, the fields in
 * order (drag, or the arrows), each with its label, Optional/Required, a
 * choice's options and an optional CRM link, and "+ add" per type. Judged live
 * by the shared validator the server runs, so a save is refused here first.
 */
export function StepFormEditor({
  stepName,
  mode,
  draft,
  onChange,
  editable,
  crmAvailable,
  serverErrors,
  standardAvailable,
}: StepFormEditorProps) {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })
  const fields = draft?.fields ?? []

  // ── The standard report of a step with no list of its own ──
  if (mode === "legacy") {
    return (
      <div
        className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3"
        data-testid="step-form-legacy"
      >
        <p className="flex items-center gap-2 text-xs font-medium text-foreground">
          <FileText className="size-3.5 text-muted-foreground" />
          {t("stepForm.legacy.title", "Uses the standard field-service report")}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t(
            "stepForm.legacy.body",
            "The assigned member is asked what they did, before and after photos, " +
              "both signatures and the customer's name. Customise it to ask your own " +
              "questions, or ask nothing here.",
          )}
        </p>
        {editable && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => onChange(presetDraft("fieldService", tr))}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              {t("stepForm.legacy.customise", "Customise")}
            </button>
            <button
              type="button"
              onClick={() => onChange(askNothingDraft())}
              className={
                "rounded-md border border-border bg-background px-2.5 py-1 text-xs " +
                "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              {t("stepForm.legacy.askNothing", "Ask nothing")}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_220px]" data-testid="step-form-editor">
      <StepFormFieldList
        draft={draft}
        onChange={onChange}
        editable={editable}
        crmAvailable={crmAvailable}
        serverErrors={serverErrors}
        standardAvailable={standardAvailable}
      />

      <StepFormPreview stepName={stepName} fields={fields} />
    </div>
  )
}
