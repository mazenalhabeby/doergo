"use client"

import { useTranslation } from "react-i18next"
import { Camera, X } from "lucide-react"
import {
  localDayKey,
  type KindLogField,
  type KindLogType,
  type LogValueProblem,
} from "@hbcfield/shared/client"
import { logFieldLabel } from "@/components/assets/log-style"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** The photo formats the server accepts for a logbook photo. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"

/** Today as a LOCAL day — the one the person's wall calendar shows. */
export const todayIso = () => localDayKey(new Date())

export function FieldInput({
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

export function problemText(t: (k: string, d: string) => string, p: LogValueProblem): string {
  switch (p.code) {
    case "required": return t("assetLog.problem.required", "This is needed")
    case "not-a-number": return t("assetLog.problem.notANumber", "That is not a number")
    case "out-of-range": return t("assetLog.problem.outOfRange", "That number is out of range")
    case "not-a-date": return t("assetLog.problem.notADate", "That date could not be read")
    case "not-an-option": return t("assetLog.problem.notAnOption", "Pick one of the options")
    case "too-long": return t("assetLog.problem.tooLong", "That is too long")
  }
}
