"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  STEP_FORM_LIMITS,
  type StepForm,
  type StepFormAnswers,
  type StepFormField,
} from "@hbcfield/shared/client"
import { serverErrorMessage } from "@/lib/server-error"
import { uploadTaskFile, dataUrlToFile } from "@/lib/task-file-upload"
import {
  answerRefusal,
  buildAnswers,
  checkAnswers,
  type AnswerErrors,
  type DraftValue,
} from "@/lib/step-forms"

/** The photo types a step-form photo may be — the server wants an image. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"]

const MAX_PHOTO_BYTES = 20 * 1024 * 1024

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

/** useStepMoveDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useStepMoveDialogData(
  {
    open,
    taskId,
    stepName,
    form,
    legacy,
    onSubmit,
    onCancel
  }: Pick<Pick<StepMoveDialogProps, 'open' | 'taskId' | 'stepName' | 'form' | 'legacy' | 'onSubmit' | 'onCancel'>,
    | 'open'
    | 'taskId'
    | 'stepName'
    | 'form'
    | 'legacy'
    | 'onSubmit'
    | 'onCancel'
  >) {
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

  const errorText = (code: string) => t(
    `stepForm.answerError.${code}`,
    { defaultValue: t("stepForm.answerError.invalid", "This answer is not valid.") })

  const addPhotos = (field: StepFormField, list: FileList | null) => {
    if (!list) return
    const cur = values[field.id]
    const items = cur?.kind === "photos" ? [...cur.items] : []
    const refused: string[] = []
    for (const file of Array.from(list)) {
      if (items.length >= STEP_FORM_LIMITS.maxPhotos) break
      if (!PHOTO_TYPES.includes(
        file.type)) { refused.push(
          t("stepForm.dialog.notAPhoto", { name: file.name, defaultValue: "{{name}} is not a photo." })); continue }
      if (file.size > MAX_PHOTO_BYTES) { refused.push(
        t("stepForm.dialog.photoTooBig", { name: file.name, defaultValue: "{{name}} is larger than 20 MB." })); continue }
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
      setGeneral(
        t(
          "stepForm.dialog.uploadFailed",
          { error: serverErrorMessage(err, t, i18n.language), defaultValue: "A file could not be uploaded: {{error}}" }))
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

  return {
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
  }
}
