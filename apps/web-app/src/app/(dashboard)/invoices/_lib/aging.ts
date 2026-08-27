import type { Invoice } from "@/lib/api"

/*
  Ageing — the idea the invoice list was missing.

  It listed how many invoices were overdue and nothing else, so one five days
  late and one four months late looked identical. They are not the same problem:
  the first is a reminder, the second is a phone call or a write-off. Every
  accounts-receivable dashboard is built around this because, as the practice
  puts it, THE AGE CHANGES THE ACTION.

  Bands follow the standard 30/60/90 split so the numbers mean the same thing
  they do in an accountant's report.
*/
export type AgeBand = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus"

export const AGE_BANDS: AgeBand[] = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"]

/** Days past due. Negative means not due yet; 0 means due today. */
export function daysOverdue(dueDate?: string | null, now = new Date()): number | null {
  if (!dueDate) return null
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return null
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((b - a) / 86400000)
}

export function bandFor(days: number | null): AgeBand {
  if (days === null || days <= 0) return "current"
  if (days <= 30) return "d1_30"
  if (days <= 60) return "d31_60"
  if (days <= 90) return "d61_90"
  return "d90_plus"
}

/**
 * Only unpaid invoices age.
 *
 * A paid or cancelled invoice has no age worth showing — it is settled, and
 * counting it would inflate the very figure someone is using to decide who to
 * chase today.
 */
export function isOutstanding(inv: Pick<Invoice, "status">): boolean {
  return inv.status === "SENT" || inv.status === "OVERDUE"
}

export interface AgingSummary {
  outstanding: number
  outstandingCount: number
  overdue: number
  overdueCount: number
  bands: Record<AgeBand, { amount: number; count: number }>
  /** The single oldest unpaid invoice, in days. Null when nothing is overdue. */
  oldestDays: number | null
  /**
   * Every distinct currency among the outstanding invoices.
   *
   * More than one means the totals above are adding euros to dollars, which is
   * not a number — the screen has to say so rather than print a confident sum.
   */
  currencies: string[]
}

export function summarise(invoices: Invoice[], now = new Date()): AgingSummary {
  const bands = Object.fromEntries(
    AGE_BANDS.map((b) => [b, { amount: 0, count: 0 }]),
  ) as AgingSummary["bands"]

  let outstanding = 0, outstandingCount = 0, overdue = 0, overdueCount = 0
  let oldestDays: number | null = null
  const currencies = new Set<string>()

  for (const inv of invoices) {
    if (!isOutstanding(inv)) continue
    const amount = inv.total || 0
    const days = daysOverdue(inv.dueDate, now)
    const band = bandFor(days)

    outstanding += amount
    outstandingCount++
    currencies.add(inv.currency || "EUR")
    bands[band].amount += amount
    bands[band].count++

    if (band !== "current") {
      overdue += amount
      overdueCount++
      if (days !== null && (oldestDays === null || days > oldestDays)) oldestDays = days
    }
  }

  return {
    outstanding, outstandingCount, overdue, overdueCount, bands, oldestDays,
    currencies: [...currencies],
  }
}

/**
 * Most urgent first: the longest overdue at the top, then everything else by
 * due date. A list sorted by invoice number tells you nothing about what to do
 * next, which is the only question this page exists to answer.
 */
export function byUrgency(a: Invoice, b: Invoice, now = new Date()): number {
  const ao = isOutstanding(a), bo = isOutstanding(b)
  if (ao !== bo) return ao ? -1 : 1 // settled invoices sink
  const ad = daysOverdue(a.dueDate, now) ?? -Infinity
  const bd = daysOverdue(b.dueDate, now) ?? -Infinity
  return bd - ad
}
