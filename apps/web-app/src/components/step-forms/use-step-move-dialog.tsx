"use client"

import { ImagePlus, X } from "lucide-react"
import { STEP_FORM_LIMITS, type StepFormField } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
import { SignaturePad } from "@/components/common/signature-pad"
import { cn } from "@/lib/utils"
import { useStepMoveDialogData, PHOTO_TYPES, type StepMoveDialogProps } from "./use-step-move-dialog-data"
export { type StepMoveDialogProps } from "./use-step-move-dialog-data"

/** StepMoveDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useStepMoveDialog(
  {
    open,
    taskId,
    stepName,
    form,
    legacy,
    onSubmit,
    onCancel
  }: Pick<StepMoveDialogProps, 'open' | 'taskId' | 'stepName' | 'form' | 'legacy' | 'onSubmit' | 'onCancel'>) {
  const {
    t,
    tr,
    values,
    files,
    errors,
    general,
    busy,
    required,
    set,
    errorText,
    addPhotos,
    removePhoto,
    submit,
  } = useStepMoveDialogData({ open, taskId, stepName, form, legacy, onSubmit, onCancel })

  const fieldBody = (field: StepFormField) => {
    const v = values[field.id]
    const disabled = !!busy
    switch (field.type) {
      case "note":
        return (
          <Textarea
            value={v?.kind === "text" ? v.value : ""}
            onChange={(e) => set(field.id, { kind: "text", value: e.target.value })}
            placeholder={t("stepForm.dialog.notePlaceholder", "Type here…")}
            maxLength={STEP_FORM_LIMITS.maxNoteLength}
            rows={3}
            disabled={disabled}
          />
        )
      case "name":
        return (
          <Input
            value={v?.kind === "text" ? v.value : ""}
            onChange={(e) => set(field.id, { kind: "text", value: e.target.value })}
            placeholder={t("stepForm.dialog.namePlaceholder", "Name")}
            maxLength={STEP_FORM_LIMITS.maxNameLength}
            disabled={disabled}
          />
        )
      case "number":
        return (
          <Input
            inputMode="decimal"
            value={v?.kind === "number" ? v.value : ""}
            onChange={(e) => set(field.id, { kind: "number", value: e.target.value })}
            placeholder="0"
            disabled={disabled}
          />
        )
      case "date":
        return (
          <DatePicker
            value={v?.kind === "text" ? v.value : ""}
            onChange={(d) => set(field.id, { kind: "text", value: d })}
            placeholder={t("stepForm.dialog.datePlaceholder", "Pick a day")}
            clearable={!field.required}
            disabled={disabled}
          />
        )
      case "choice":
        return (
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {(field.options ?? []).map((o) => {
              const on = v?.kind === "text" && v.value === o
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => set(field.id, { kind: "text", value: on && !field.required ? "" : o })}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/40 text-foreground hover:bg-muted",
                  )}
                >
                  {o}
                </button>
              )
            })}
          </div>
        )
      case "yesno": {
        const cur = v?.kind === "yesno" ? v.value : null
        return (
          <div className="inline-flex rounded-full bg-muted p-0.5" role="radiogroup">
            {[true, false].map((b) => (
              <button
                key={String(b)}
                type="button"
                role="radio"
                aria-checked={cur === b}
                disabled={disabled}
                onClick={() => set(field.id, { kind: "yesno", value: cur === b && !field.required ? null : b })}
                className={cn(
                  "rounded-full px-4 py-1 text-xs font-medium transition-colors",
                  cur === b ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {b ? t("stepForm.dialog.yes", "Yes") : t("stepForm.dialog.no", "No")}
              </button>
            ))}
          </div>
        )
      }
      case "photos": {
        const items = v?.kind === "photos" ? v.items : []
        return (
          <div className="grid grid-cols-4 gap-2">
            {items.map((it) => {
              const f = files.current.get(it.key)
              return (
                <div key={it.key} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                  {f && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.preview} alt={f.file.name} decoding="async" className="size-full object-cover" />
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removePhoto(field, it.key)}
                    aria-label={t("stepForm.dialog.removePhoto", "Remove photo")}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              )
            })}
            {items.length < STEP_FORM_LIMITS.maxPhotos && (
              <label
                className={cn(
                  ("flex aspect-square cursor-pointer flex-col items-center justify-center " +
                    "gap-1 rounded-lg border border-dashed text-[11px] text-muted-foreground " +
                    "hover:bg-muted/50"),
                  disabled && "pointer-events-none opacity-50",
                )}
              >
                <ImagePlus className="size-4" />
                {t("stepForm.dialog.addPhotos", "Add photos")}
                <input
                  type="file"
                  accept={PHOTO_TYPES.join(",")}
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    addPhotos(field, e.target.files)
                    e.target.value = ""
                  }}
                />
              </label>
            )}
          </div>
        )
      }
      case "signature":
        return (
          <SignaturePad
            height={140}
            disabled={disabled}
            onChange={(dataUrl) => set(field.id, { kind: "signature", dataUrl })}
          />
        )
    }
  }

  return {
    t,
    tr,
    errors,
    general,
    busy,
    required,
    errorText,
    submit,
    fieldBody,
  }
}
