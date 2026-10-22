import { localDateKey } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"
import { formatMediumDate } from "@/lib/format-date"

/** Calendar days for the member's requests page: keys, steps, the month grid, the booked days. */

export const toISO = (d: Date) => localDateKey(d)

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)

export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // Monday = 0
  const cells: (Date | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** ISO day → the request occupying it. Cheap lookup while rendering the grid. */
export function bookedDays(list: TimeOffRequest[]): Map<string, TimeOffRequest> {
  const map = new Map<string, TimeOffRequest>()
  for (const r of list) {
    if (r.status === "REJECTED" || r.status === "CANCELED") continue
    const end = startOfDay(new Date(r.endDate))
    for (let d = startOfDay(new Date(r.startDate)); d <= end; d = addDays(d, 1)) {
      map.set(toISO(d), r)
    }
  }
  return map
}

export const sameDay = (a: Date, b: Date) => toISO(a) === toISO(b)

export function fmt(iso?: string): string {
  if (!iso) return "—"
  // A bare day key is read at LOCAL midnight — `new Date("2026-10-05")` is UTC
  // midnight, which west of Greenwich is still the 4th.
  return formatMediumDate(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
}
