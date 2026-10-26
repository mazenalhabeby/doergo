"use client"

import { parseDaysInput } from "@/lib/leave-ledger"
import { cn } from "@/lib/utils"

/** A day count as typed — half days, "10,5" reads 10.5; a cell it cannot read turns red. */
export function DaysCell({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const bad = parseDaysInput(value) === null
  return (
    <input
      aria-label={label}
      aria-invalid={bad || undefined}
      inputMode="decimal"
      value={value}
      placeholder="0"
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 w-24 rounded-lg border bg-background px-2.5 text-right font-mono " +
          "text-sm tabular-nums outline-none transition-colors focus:border-primary",
        bad ? "border-shell-crit text-shell-crit" : "border-border",
      )}
    />
  )
}
