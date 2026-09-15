"use client"

import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Camera, Loader2, Plus, X } from "lucide-react"

import {
  logTypesForKind, validateLogValues, readLogNumber,
  type KindLogField, type KindLogType, type KindShape, type LogValueProblem,
} from "@hbcfield/shared/client"
import { assetsApi, uploadToS3 } from "@/lib/api"
import { logColor, logFieldLabel, logTypeLabel } from "@/components/assets/log-style"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"

/** The photo formats the server accepts for a logbook photo. */
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * "+ Log" — one entry of one of the kind's log types.
 *
 * The form is DRAWN from the type: exactly its fields, in its order, with its
 * units. The same shared `validateLogValues` the server runs decides what is
 * missing or unreadable, so a problem is named beside its box before the
 * request goes rather than coming back as a sentence about the whole form.
 *
 * The id is made here and reused on a retry, so a double click or a flaky
 * network files one entry, not two.
 */
export function LogEntryDialog({
  assetId,
  shape,
  onSaved,
}: {
  assetId: string
  shape: KindShape
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const types = useMemo(() => logTypesForKind(shape), [shape])
  const [open, setOpen] = useState(false)
  const [typeKey, setTypeKey] = useState<string>(types[0]?.key ?? "")
  const [raw, setRaw] = useState<Record<string, string>>({})
  const [day, setDay] = useState(todayIso())
  const [note, setNote] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [showProblems, setShowProblems] = useState(false)
  const entryId = useRef<string>("")
  const fileInput = useRef<HTMLInputElement>(null)

  const type = types.find((x) => x.key === typeKey) ?? types[0]

  const reset = (next: boolean) => {
    if (next) {
      setTypeKey(types[0]?.key ?? "")
      setRaw({})
      setDay(todayIso())
      setNote("")
      setFile(null)
      setShowProblems(false)
      entryId.current = crypto.randomUUID()
    }
    setOpen(next)
  }

  /** What the server is sent: money converted to cents; everything else as typed. */
  const values = useMemo(() => {
    const out: Record<string, string | number> = {}
    for (const f of type?.fields ?? []) {
      const v = raw[f.key]
      if (v == null || v.trim() === "") continue
      if (f.type === "money") {
        const n = readLogNumber(v)
        out[f.key] = n === null ? v : Math.round(n * 100)
      } else {
        out[f.key] = v
      }
    }
    return out
  }, [raw, type])

  const checked = type ? validateLogValues(type, values, { hasPhoto: !!file, shape }) : null
  const problemFor = (key: string): LogValueProblem | undefined => checked?.problems.find((p) => p.key === key)

  const save = useMutation({
    mutationFn: async () => {
      if (!type) throw new Error("No log type")
      // Today means now; an earlier day means midday — no time zone turns it into the day before.
      const occurredAt = day === todayIso() ? new Date().toISOString() : new Date(`${day}T12:00:00`).toISOString()
      let receipt: { receiptKey: string; receiptName: string; receiptMime: string } | undefined
      if (file) {
        const pre = await assetsApi.presignLogPhoto(assetId, {
          logType: type.key, fileName: file.name, mimeType: file.type, occurredAt,
        })
        if (!pre?.uploadUrl) throw new Error(t("assetLog.uploadFailed", "The photo could not be uploaded"))
        await uploadToS3(pre.uploadUrl, file)
        receipt = { receiptKey: pre.fileKey, receiptName: file.name, receiptMime: file.type }
      }
      return assetsApi.createLogEntry(assetId, {
        entryId: entryId.current || undefined,
        logType: type.key,
        values,
        note: note.trim() || undefined,
        occurredAt,
        ...receipt,
      })
    },
    onSuccess: (entry) => {
      notify.success(
        entry?.status === "SUBMITTED"
          ? t("assetLog.savedWaiting", "Logged — waiting for approval")
          : t("assetLog.saved", "Logged"),
      )
      onSaved()
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (types.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" /> {t("assetLog.add", "Log")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("assetLog.addTitle", "What was done?")}</DialogTitle>
          <DialogDescription>
            {type?.needsApproval
              ? t("assetLog.approvalHint", "An entry from somebody who does not manage assets waits for approval before it counts.")
              : t("assetLog.addHint", "Everything you log here stays on this record's logbook.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* The type: one chip each, in the kind's order, Cost first. */}
          <div className="flex flex-wrap gap-1.5">
            {types.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => { setTypeKey(x.key); setRaw({}); setFile(null); setShowProblems(false) }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  x.key === type?.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", logColor(x.color).dot)} />
                {logTypeLabel(t, x)}
              </button>
            ))}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">{t("assetLog.when", "When")}</Label>
            <Input type="date" className="mt-1" value={day} max={todayIso()} onChange={(e) => setDay(e.target.value || todayIso())} />
          </div>

          {type?.fields.map((f) => (
            <FieldInput
              key={`${type.key}:${f.key}`}
              type={type}
              field={f}
              value={raw[f.key] ?? ""}
              onChange={(v) => setRaw((r) => ({ ...r, [f.key]: v }))}
              file={file}
              onFile={(fl) => setFile(fl)}
              fileInput={fileInput}
              problem={showProblems ? problemFor(f.key) : undefined}
            />
          ))}

          <div>
            <Label className="text-xs text-muted-foreground">
              {t("assetLog.note", "Note")} <span className="text-muted-foreground/60">{t("common.optional", "(optional)")}</span>
            </Label>
            <Input className="mt-1" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button
            disabled={save.isPending}
            onClick={() => {
              setShowProblems(true)
              if (checked?.ok) save.mutate()
            }}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("assetLog.save", "Save entry")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldInput({
  type, field, value, onChange, file, onFile, fileInput, problem,
}: {
  type: KindLogType
  field: KindLogField
  value: string
  onChange: (v: string) => void
  file: File | null
  onFile: (f: File | null) => void
  fileInput: React.RefObject<HTMLInputElement | null>
  problem?: LogValueProblem
}) {
  const { t } = useTranslation()
  const label = logFieldLabel(t, type, field)

  return (
    <div>
      <Label className="text-xs text-muted-foreground">
        {label}
        {field.required && <span className="text-destructive"> *</span>}
        {field.type === "number" && field.meter && (
          <span className="ml-1 text-muted-foreground/60">{t("assetLog.meterTag", "(counter)")}</span>
        )}
      </Label>

      {field.type === "choice" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "photo" ? (
        <div className="mt-1 flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={PHOTO_ACCEPT}
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Camera className="mr-1.5 h-3.5 w-3.5" /> {file ? t("assetLog.replacePhoto", "Replace") : t("assetLog.choosePhoto", "Choose a file")}
          </Button>
          {file && (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={() => onFile(null)} aria-label={t("common.remove", "Remove")} className="rounded p-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      ) : (
        <div className="relative mt-1">
          <Input
            type={field.type === "date" ? "date" : "text"}
            inputMode={field.type === "number" || field.type === "money" ? "decimal" : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={field.type === "text" ? 500 : undefined}
            className={cn((field.unit || field.type === "money") && "pr-12", problem && "border-destructive")}
          />
          {(field.unit || field.type === "money") && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              {field.type === "money" ? "€" : field.unit}
            </span>
          )}
        </div>
      )}

      {problem && <p className="mt-1 text-[11px] text-destructive">{problemText(t, problem)}</p>}
    </div>
  )
}

function problemText(t: (k: string, d: string) => string, p: LogValueProblem): string {
  switch (p.code) {
    case "required": return t("assetLog.problem.required", "This is needed")
    case "not-a-number": return t("assetLog.problem.notANumber", "That is not a number")
    case "out-of-range": return t("assetLog.problem.outOfRange", "That number is out of range")
    case "not-a-date": return t("assetLog.problem.notADate", "That date could not be read")
    case "not-an-option": return t("assetLog.problem.notAnOption", "Pick one of the options")
    case "too-long": return t("assetLog.problem.tooLong", "That is too long")
  }
}
