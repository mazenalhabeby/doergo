import { todayKey, type DayEntry, type HoursEntry } from "@hbcfield/shared/client"

export interface PartEntry { name: string; partNumber?: string | null; quantity: number; unitCost: number }
export interface WorkEntry {
  /*
    ⚠️ The rate for THIS person, not one rate for the job. A single job rate is
    wrong the moment two people with different rates work the same site — which
    is the normal case for anyone billing labour at all. `rate` below survives
    as the fallback for entries the ladder could not answer for.
  */
  billRateCents: number | null
  costRateCents: number | null
  taskId: string
  taskTitle: string
  reportId?: string | null
  workerName?: string | null
  hours: number
  notes?: string | null
  completedAt?: string | null
  parts: PartEntry[]
  hasReport: boolean
  include: boolean
  includeParts: boolean
  workerId?: string | null
  /** The worker's trade here; decides the heading the line sits under. */
  workRoleId?: string | null
  workRoleName?: string | null
  /** False = billed by the day only: listed on the invoice, not charged by the hour. */
  hoursBillable: boolean
  /** How this person is billed here — decides where their COST is counted. */
  billBy: "HOUR" | "DAY" | "BOTH"
}

/** A run of days worked at one day rate, as the screen holds it. */
export type DayRun = DayEntry & { key: string; include: boolean }
/** A run of hours on site at one hourly rate, as the screen holds it. */
export type HourRun = HoursEntry & { key: string; include: boolean }
// Local day keys through the shared `todayKey` — never the UTC ISO day, which
// east of Greenwich makes "last month" start on the 31st of the one before.

export function todayIso() { return todayKey() }

/** How a labour line's description reads. Remembered per browser — a convenience, not a record. */
export type LineStyle = { words: "full" | "name"; dates: boolean; tags: boolean }
export const LINE_STYLE_KEY = "hbc.invoice.lineStyle"
export const DEFAULT_LINE_STYLE: LineStyle = { words: "full", dates: true, tags: true }
export function readLineStyle(): LineStyle {
  const fallback = DEFAULT_LINE_STYLE
  try {
    const v = JSON.parse(localStorage.getItem(LINE_STYLE_KEY) ?? "null")
    if (!v || typeof v !== "object") return fallback
    return {
      words: v.words === "name" ? "name" : "full",
      dates: v.dates !== false,
      tags: v.tags !== false,
    }
  } catch {
    return fallback
  }
}
