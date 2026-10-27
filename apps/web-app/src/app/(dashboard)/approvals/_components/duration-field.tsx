"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatRequestMinutes } from "@/lib/requests"
import { cn } from "@/lib/utils"
import { durationFields, durationValue } from "../_lib/rule-limit"

/** The longest time one decision may count (the server's own ceiling): 24 h. */
export const DURATION_MAX_MINUTES = 1440

/**
 * The time a decision counts (overtime, extra time, time outside the shift), typed as hours and minutes — the
 * same two fields, and the same reading of them, as a rule's limit (rule-limit.ts: "1,5" h is 1 h 30 min). It
 * reports total minutes, or null when a field cannot be read. Keyed by the item, it starts on that item's own.
 */
export function DurationField({
  id,
  initialMinutes,
  invalid,
  onChange,
}: {
  id: string
  initialMinutes: number
  invalid: boolean
  onChange: (minutes: number | null) => void
}) {
  const { t } = useTranslation()
  const [hm, setHm] = useState(() => durationFields(String(initialMinutes)))
  const total = durationValue(hm.h, hm.m)
  // Decimal hours ("1,5") are read back as the time they mean, so nobody approves 1 h 50 min by mistake.
  const echo =
    total && /[.,]/.test(hm.h)
      ? t("approvals.durationEquals", { time: formatRequestMinutes(Number(total), (k, o) => t(k, o)) })
      : null
  const set = (next: { h: string; m: string }) => {
    setHm(next)
    const v = durationValue(next.h, next.m)
    onChange(v === null ? null : Number(v || 0))
  }
  // Text with a number keyboard, never type="number": Safari reads a decimal comma there as empty.
  const field = (part: "h" | "m") => (
    <Input
      id={part === "h" ? id : undefined}
      type="text"
      inputMode={part === "h" ? "decimal" : "numeric"}
      autoComplete="off"
      value={hm[part]}
      onChange={(e) => set({ ...hm, [part]: e.target.value })}
      aria-label={`${t("approvals.duration")} · ${t(part === "h" ? "approvals.tree.unit.h" : "approvals.tree.unit.min")}`}
      aria-invalid={invalid || undefined}
      aria-describedby={`${id}-hint`}
      className="w-16 text-center"
    />
  )
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("approvals.duration")}</Label>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {field("h")}
        <span>{t("approvals.tree.unit.h")}</span>
        {field("m")}
        <span>{t("approvals.tree.unit.min")}</span>
      </div>
      {/* What is wrong, said in words: a field that cannot be read is not "out of range". */}
      <p
        id={`${id}-hint`}
        aria-live="polite"
        className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}
      >
        {total === null ? t("approvals.durationUnreadable") : t("approvals.durationRange")}
        {echo && !invalid && <span className="ml-1.5 font-medium text-foreground">{echo}</span>}
      </p>
    </div>
  )
}
