"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ImagePlus, Loader2, X, AlertCircle } from "lucide-react"
import { STEP_FORM_LIMITS, type StepForm, type StepFormAnswers, type StepFormField } from "@hbcfield/shared/client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
import { SignaturePad } from "@/components/signature-pad"
import { serverErrorMessage } from "@/lib/server-error"
import { uploadTaskFile, dataUrlToFile } from "@/lib/task-file-upload"
import {
  answerRefusal,
  buildAnswers,
  checkAnswers,
  stepFieldLabel,
  type AnswerErrors,
  type DraftValue,
} from "@/lib/step-forms"
import { cn } from "@/lib/utils"
import { useStepMoveDialog, type StepMoveDialogProps } from "./use-step-move-dialog"

/**
 * "Ask when a job moves here", on the web.
 *
 * Built from the step's fields in their order. Photos and signatures are put on
 * the job as attachments FIRST (the answers name them by id), then the move is
 * sent with the answers. A refusal stays in the dialog, on the field it names —
 * nothing the member typed is lost to a toast.
 */
export function StepMoveDialog({ open, taskId, stepName, form, legacy, onSubmit, onCancel }: StepMoveDialogProps) {
  const {
    t,
    tr,
    errors,
    general,
    busy,
    required,
    errorText,
    submit,
    fieldBody,
  } = useStepMoveDialog({ open, taskId, stepName, form, legacy, onSubmit, onCancel })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel() }}>
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
                className={cn("space-y-2 rounded-xl border bg-muted/20 p-3", errs && "border-red-400 dark:border-red-500/60")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{stepFieldLabel(field, tr)}</span>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wide",
                      field.required ? "text-primary" : "text-muted-foreground")}>
                    {field.required ? t("stepForm.required", "Required") : t("stepForm.optional", "Optional")}
                  </span>
                </div>
                {fieldBody(field)}
                {errs && (
                  <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400" data-testid={`step-error-${field.id}`}>
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
