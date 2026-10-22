"use client"

import { Loader2, AlertCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { StepForm, StepFormAnswers } from "@hbcfield/shared/client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { stepFieldLabel } from "@/lib/step-forms"
import { cn } from "@/lib/utils"
import { useStepMoveAnswers } from "./use-step-move-answers"
import { StepFormAnswerInput } from "./step-form-answer-input"

export interface StepMoveDialogProps {
  open: boolean
  taskId: string
  /** The step's name, as the reader sees it. */
  stepName: string
  form: StepForm
  /** The standard field-service report of a step with no form of its own. */
  legacy: boolean
  /** Send the move with these answers. Throws the server's refusal. */
  onSubmit: (answers: StepFormAnswers) => Promise<void>
  onCancel: () => void
}

/**
 * "Ask when a job moves here", on the web.
 *
 * Built from the step's fields in their order. Photos and signatures are put on
 * the job as attachments FIRST (the answers name them by id), then the move is
 * sent with the answers. A refusal stays in the dialog, on the field it names —
 * nothing the member typed is lost to a toast.
 */
export function StepMoveDialog({ open, taskId, stepName, form, legacy, onSubmit, onCancel }: StepMoveDialogProps) {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })
  const { values, files, errors, general, busy, required, set, errorText, addPhotos, removePhoto, submit } =
    useStepMoveAnswers({ taskId, form, onSubmit })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onCancel()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("stepForm.dialog.title", { step: stepName, defaultValue: "Move to {{step}}" })}</DialogTitle>
          <DialogDescription>
            {legacy
              ? t("stepForm.dialog.legacyCaption", "The standard field-service report.")
              : t("stepForm.dialog.caption", {
                  required,
                  count: form.fields.length,
                  defaultValue: "{{required}} required · {{count}} fields, from the workflow",
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {form.fields.map((field) => {
            const errs = errors[field.id]
            return (
              <div
                key={field.id}
                className={cn(
                  "space-y-2 rounded-xl border bg-muted/20 p-3",
                  errs && "border-red-400 dark:border-red-500/60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{stepFieldLabel(field, tr)}</span>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wide",
                      field.required ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {field.required ? t("stepForm.required", "Required") : t("stepForm.optional", "Optional")}
                  </span>
                </div>
                <StepFormAnswerInput
                  field={field}
                  value={values[field.id]}
                  disabled={!!busy}
                  files={files.current}
                  set={set}
                  addPhotos={addPhotos}
                  removePhoto={removePhoto}
                />
                {errs && (
                  <p
                    className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400"
                    data-testid={`step-error-${field.id}`}
                  >
                    <AlertCircle className="mt-px size-3.5 shrink-0" />
                    {errorText(errs[0]!)}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {general && (
          <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            {general}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={!!busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!!busy}>
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {busy === "uploading"
              ? t("stepForm.dialog.uploading", "Uploading…")
              : t("stepForm.dialog.submit", { step: stepName, defaultValue: "Move to {{step}}" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
