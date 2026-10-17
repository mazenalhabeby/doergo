"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  CircleDot,
  GripVertical,
  Hash,
  Image as ImageIcon,
  PenLine,
  Plus,
  ToggleLeft,
  Type,
  X,
  AlertCircle,
  FileText,
  type LucideIcon,
} from "lucide-react"
import {
  STEP_FORM_FIELD_TYPES,
  STEP_FORM_LIMITS,
  STEP_FORM_PRESET_IDS,
  type StepFormField,
  type StepFormFieldType,
  type StepFormPresetId,
} from "@hbcfield/shared/client"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  askNothingDraft,
  crmLinkFor,
  crmLinkFree,
  definitionErrors,
  moveField,
  newField,
  presetDraft,
  stepFieldLabel,
  type DefinitionErrors,
  type StepFormDraft,
} from "@/lib/step-forms"
import { useStepFormEditor, type StepFormEditorProps } from "./use-step-form-editor"
import { FIELD_TYPE_ICON, PRESET_NAME, OptionsEditor, StepFormPreview } from "./step-form-editor-helpers"
import { StepFormEditorStartFrom } from "./step-form-editor-start-from"

/**
 * "Ask when a job moves here" — one step's list of questions.
 *
 * The same shape as the approved mockup: Start from a preset, the fields in
 * order (drag, or the arrows), each with its label, Optional/Required, a
 * choice's options and an optional CRM link, and "+ add" per type. Judged live
 * by the shared validator the server runs, so a save is refused here first.
 */
export function StepFormEditor({ stepName, mode, draft, onChange, editable, crmAvailable, serverErrors, standardAvailable }: StepFormEditorProps) {
  const vm = useStepFormEditor({ stepName, mode, draft, onChange, editable, crmAvailable, serverErrors, standardAvailable })
  const {
    t,
    tr,
    dragFrom,
    setDragFrom,
    dragOver,
    setDragOver,
    fields,
    errorsFor,
    formErrors,
    defError,
    setFields,
    update,
    remove,
    typeName,
  } = vm

  // ── The standard report of a step with no list of its own ──
  if (mode === "legacy") {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3" data-testid="step-form-legacy">
        <p className="flex items-center gap-2 text-xs font-medium text-foreground">
          <FileText className="size-3.5 text-muted-foreground" />
          {t("stepForm.legacy.title", "Uses the standard field-service report")}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t("stepForm.legacy.body", "The assigned member is asked what they did, before and after photos, both signatures and the customer's name. Customise it to ask your own questions, or ask nothing here.")}
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
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
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
      <StepFormEditorStartFrom vm={vm} editable={editable} onChange={onChange} standardAvailable={standardAvailable} crmAvailable={crmAvailable} />

      <StepFormPreview stepName={stepName} fields={fields} />
    </div>
  )
}
