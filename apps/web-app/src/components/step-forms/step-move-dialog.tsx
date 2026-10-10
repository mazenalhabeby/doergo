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

/** The photo types a step-form photo may be — the server wants an image. */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"]
const MAX_PHOTO_BYTES = 20 * 1024 * 1024

interface StepMoveDialogProps {
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
  const { t, i18n } = useTranslation()
  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })

  const [values, setValues] = useState<Record<string, DraftValue>>({})
  const files = useRef(new Map<string, { file: File; preview: string }>())
  const [errors, setErrors] = useState<AnswerErrors>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | "uploading" | "saving">(null)

  // Revoke previews when the dialog goes away.
  useEffect(() => {
    const map = files.current
    return () => map.forEach((f) => URL.revokeObjectURL(f.preview))
  }, [])

  const required = form.fields.filter((f) => f.required).length

  const set = (id: string, v: DraftValue) => {
    setValues((prev) => ({ ...prev, [id]: v }))
    setErrors((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const errorText = (code: string) => t(`stepForm.answerError.${code}`, { defaultValue: t("stepForm.answerError.invalid", "This answer is not valid.") })

  const addPhotos = (field: StepFormField, list: FileList | null) => {
    if (!list) return
    const cur = values[field.id]
    const items = cur?.kind === "photos" ? [...cur.items] : []
    const refused: string[] = []
    for (const file of Array.from(list)) {
      if (items.length >= STEP_FORM_LIMITS.maxPhotos) break
      if (!PHOTO_TYPES.includes(file.type)) { refused.push(t("stepForm.dialog.notAPhoto", { name: file.name, defaultValue: "{{name}} is not a photo." })); continue }
      if (file.size > MAX_PHOTO_BYTES) { refused.push(t("stepForm.dialog.photoTooBig", { name: file.name, defaultValue: "{{name}} is larger than 20 MB." })); continue }
      const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      files.current.set(key, { file, preview: URL.createObjectURL(file) })
      items.push({ key })
    }
    set(field.id, { kind: "photos", items })
    setGeneral(refused.length ? refused.join(" ") : null)
  }

  const removePhoto = (field: StepFormField, key: string) => {
    const cur = values[field.id]
    if (cur?.kind !== "photos") return
    const f = files.current.get(key)
    if (f) URL.revokeObjectURL(f.preview)
    files.current.delete(key)
    set(field.id, { kind: "photos", items: cur.items.filter((it) => it.key !== key) })
  }

  const submit = async () => {
    setGeneral(null)
    // 1. Judge what is there before anything is uploaded — the same check the server runs.
    const first = checkAnswers(form, buildAnswers(form, values))
    if (Object.keys(first).length) {
      setErrors(first)
      return
    }

    // 2. Put photos and signatures on the job. Done once: a retry after a
    //    refusal re-uses what already went up.
    let next = values
    try {
      setBusy("uploading")
      for (const field of form.fields) {
        const v = next[field.id]
        if (v?.kind === "photos") {
          const items = []
          for (const it of v.items) {
            if (it.uploadedId) { items.push(it); continue }
            const f = files.current.get(it.key)
            if (!f) continue
            items.push({ ...it, uploadedId: await uploadTaskFile(taskId, f.file) })
          }
          next = { ...next, [field.id]: { kind: "photos", items } }
        } else if (v?.kind === "signature" && v.dataUrl && !v.uploadedId) {
          const id = await uploadTaskFile(taskId, dataUrlToFile(v.dataUrl, `signature-${field.id}.png`))
          next = { ...next, [field.id]: { ...v, uploadedId: id } }
        }
      }
      setValues(next)
    } catch (err) {
      setBusy(null)
      setGeneral(t("stepForm.dialog.uploadFailed", { error: serverErrorMessage(err, t, i18n.language), defaultValue: "A file could not be uploaded: {{error}}" }))
      return
    }

    // 3. The move, with its answers.
    const answers = buildAnswers(form, next)
    setBusy("saving")
    try {
      await onSubmit(answers)
    } catch (err) {
      const byField = answerRefusal(err, form, answers)
      if (byField) {
        setErrors(byField)
        // A file the server would not take is dropped from the upload cache, so it goes up again.
        setValues((prev) => {
          const out = { ...prev }
          for (const f of form.fields) {
            const v = out[f.id]
            if (!byField[f.id]) continue
            if (v?.kind === "photos") out[f.id] = { kind: "photos", items: v.items.map(({ key }) => ({ key })) }
            if (v?.kind === "signature") out[f.id] = { kind: "signature", dataUrl: v.dataUrl }
          }
          return out
        })
        if (byField["*"]) setGeneral(t("stepForm.dialog.refused", "Some answers were not accepted."))
      } else {
        setGeneral(serverErrorMessage(err, t, i18n.language))
      }
    } finally {
      setBusy(null)
    }
  }

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
                  "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[11px] text-muted-foreground hover:bg-muted/50",
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
                  <span className={cn("text-[10px] font-medium uppercase tracking-wide", field.required ? "text-primary" : "text-muted-foreground")}>
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
