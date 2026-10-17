"use client"

import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMediumDate } from "@/lib/format-date"

/** MyTimeOffPage's module-level helpers, moved here unchanged so its sections can read them too. */
export const STATUS_STYLES: Record<string, string> = {
  PENDING: "text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-500/15",
  APPROVED: "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-500/15",
  REJECTED: "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-500/15",
  CANCELED: "text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-500/15",
}

export function fmt(iso?: string): string {
  if (!iso) return "—"
  // A bare day key is read at LOCAL midnight — `new Date("2026-10-05")` is UTC
  // midnight, which west of Greenwich is still the 4th.
  return formatMediumDate(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
}

export function Stat({ icon: Icon, value, label, tone, small }: {
  icon: typeof CalendarDays; value: string; label: string; tone?: "amber"; small?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3 sm:px-4">
      <Icon className={cn("size-4", tone === "amber" ? "text-amber-500" : "text-muted-foreground")} />
      <p className={cn("mt-2 font-semibold tabular-nums text-foreground", small ? "text-sm" : "text-2xl")}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  )
}

export function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  )
}
