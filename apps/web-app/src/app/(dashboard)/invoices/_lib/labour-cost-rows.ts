import type { DayEntry, HoursEntry } from "@hbcfield/shared/client"

/**
 * "What this invoice makes", one row per person: their hours, their days, what
 * you pay them, and what that comes to.
 *
 * ⚠️ THE COST IS THE SERVER'S. Each line arrives with `costCents` already worked
 * out (billing/labour-cost.ts: hours × hourly cost + days × day cost, each part
 * on one line only). This only ADDS those up per person and picks the numbers
 * to show — it never multiplies a rate itself, so the panel and the line can
 * never disagree.
 *
 * ⚠️ A person billed by hour AND day has two lines over the same days. Hours
 * come from the HOURS lines and days from the DAYS lines, never both summed,
 * or the same week reads twice.
 */
export interface CostRow {
  key: string
  workerId: string | null
  name: string
  role: string | null
  hours: number
  days: number
  hourRateCents: number | null
  dayRateCents: number | null
  /** null = no cost rate of either kind — the person the warning names. */
  costCents: number | null
}

/** A job line on a CLIENT invoice — costed by the hour, as the server resolved it. */
interface CostedJob {
  include: boolean
  workerId?: string | null
  workerName?: string | null
  workRoleName?: string | null
  hours: number
  billBy: "HOUR" | "DAY" | "BOTH"
  costRateCents?: number | null
}

export function labourCostRows(
  hours: HoursEntry[],
  days: DayEntry[],
  jobs: CostedJob[] = [],
  unassigned = "—",
): CostRow[] {
  const rows = new Map<string, CostRow & { hasHours: boolean; hasDays: boolean; known: boolean }>()
  const row = (id: string | null | undefined, name: string, role: string | null | undefined) => {
    const key = id || `name:${name}`
    let r = rows.get(key)
    if (!r) {
      r = {
        key,
        workerId: id ?? null,
        name,
        role: role ?? null,
        hours: 0,
        days: 0,
        hourRateCents: null,
        dayRateCents: null,
        costCents: 0,
        hasHours: false,
        hasDays: false,
        known: false
      }
      rows.set(key, r)
    }
    return r
  }
  const addCost = (r: CostRow & { known: boolean }, cents: number | null | undefined) => {
    if (cents == null) return
    r.costCents = (r.costCents ?? 0) + cents
    r.known = true
  }

  for (const h of hours) {
    const r = row(h.workerId, h.workerName, h.workRoleName)
    r.hasHours = true
    r.hours += h.countedHours ?? h.hours
    if (!r.hasDays) r.days += h.days
    r.hourRateCents = h.costHourRateCents ?? r.hourRateCents
    r.dayRateCents = h.costDayRateCents ?? r.dayRateCents
    addCost(r, h.costCents)
  }
  for (const d of days) {
    const r = row(d.workerId, d.workerName, d.workRoleName)
    // Days come from the DAYS lines: drop what the hours lines counted.
    if (!r.hasDays) { r.days = 0; r.hasDays = true }
    r.days += d.days
    if (!r.hasHours) r.hours += d.hours ?? 0
    r.hourRateCents = d.costHourRateCents ?? r.hourRateCents
    r.dayRateCents = d.costDayRateCents ?? r.dayRateCents
    addCost(r, d.costCents)
  }
  for (const j of jobs) {
    if (!j.include || j.hours <= 0) continue
    const r = row(j.workerId, j.workerName || unassigned, j.workRoleName)
    r.hours += j.hours
    if (j.billBy === "DAY") continue // listed, not costed by the hour
    r.hourRateCents = j.costRateCents ?? r.hourRateCents
    addCost(r, j.costRateCents == null ? null : Math.round(j.hours * j.costRateCents))
  }

  return [...rows.values()]
    .map(({ hasHours, hasDays, known, ...r }) => {
      void hasHours
      void hasDays
      return { ...r, costCents: known ? r.costCents : null }
    })
    .sort((a, b) => (b.costCents ?? -1) - (a.costCents ?? -1) || a.name.localeCompare(b.name))
}
