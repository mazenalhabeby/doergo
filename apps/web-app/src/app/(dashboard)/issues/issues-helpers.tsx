"use client"

import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"

/** Shared by the issues page and its thread; moved here unchanged. */
export const SEV_DOT: Record<string, string> = {
  LOW: "bg-slate-400",
  MEDIUM: "bg-blue-500",
  HIGH: "bg-orange-500",
  URGENT: "bg-red-500",
}

export const SEV_TEXT: Record<string, string> = {
  LOW: "text-slate-600",
  MEDIUM: "text-blue-600",
  HIGH: "text-orange-600",
  URGENT: "text-red-600",
}

export const STATUS: Record<string, string> = {
  OPEN: "text-red-700 bg-red-50 border-red-200 dark:bg-red-950/40 dark:text-red-300",
  ACKNOWLEDGED: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  IN_PROGRESS: "text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  RESOLVED: "text-green-700 bg-green-50 border-green-200 dark:bg-green-950/40 dark:text-green-300",
  CLOSED: "text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  CANCELED: "text-slate-500 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
}

export const RESOLVE_REASONS = [
  "Fixed on site",
  "Parts not available",
  "Needs a specialist",
  "Customer unavailable",
  "Duplicate",
  "Not an issue",
]

export const fmt = (iso: string) =>
  new Date(iso).toLocaleString(dateLocale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

export const isImg = (m?: string) => !!m && m.startsWith("image/")

export const Chip = ({ status }: { status: string }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] " + "font-semibold uppercase tracking-wide",
      STATUS[status],
    )}
  >
    {status.replace("_", " ")}
  </span>
)
