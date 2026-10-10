import { localDateKey, type CalendarItem } from "@hbcfield/shared/client"
import { addDays } from "@/lib/local-days"

/**
 * Where things go on the grid — pure, so the week, the day and the month draw from one answer.
 *
 * Days are local date keys (YYYY-MM-DD) in the viewer's browser zone; timed items carry instants.
 */

export const HOUR_PX = 48

export function dayKey(d: Date): string {
  return localDateKey(d)
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y!, m! - 1, d!)
}

export { addDays }

/** Monday of the week containing `d` (weeks start on Monday). */
export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7
  return addDays(x, -dow)
}

export function daysFrom(start: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) => addDays(start, i))
}

/** The 6×7 grid that shows a month, Monday first. */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  return daysFrom(startOfWeek(first), 42)
}

/** The local day keys an item touches, clipped to the given window. */
export function itemDays(item: CalendarItem, from: string, to: string): string[] {
  let s: string, e: string
  if (item.allDay) {
    s = item.start
    e = item.end
  } else {
    const st = new Date(item.start), en = new Date(new Date(item.end).getTime() - 1)
    s = dayKey(st)
    e = dayKey(en < st ? st : en)
  }
  if (s < from) s = from
  if (e > to) e = to
  const out: string[] = []
  for (let d = fromKey(s); dayKey(d) <= e; d = addDays(d, 1)) out.push(dayKey(d))
  return out
}

/** Long or all-day items go in the band above the hours; short timed ones in the grid. */
export function inBand(item: CalendarItem): boolean {
  if (item.allDay) return true
  return new Date(item.end).getTime() - new Date(item.start).getTime() >= 20 * 3600000
}

export interface BandBar {
  item: CalendarItem
  /** 0-based column of the first day shown, and how many columns it spans. */
  col: number
  span: number
  lane: number
}

/** All-day bars across a row of days, packed into the fewest lanes. */
export function layoutBand(items: CalendarItem[], keys: string[]): { bars: BandBar[]; lanes: number } {
  const from = keys[0]!, to = keys[keys.length - 1]!
  const sorted = items
    .map((item) => ({ item, days: itemDays(item, from, to) }))
    .filter((x) => x.days.length)
    .sort((a, b) => (a.days[0]! < b.days[0]! ? -1 : a.days[0]! > b.days[0]! ? 1 : b.days.length - a.days.length))
  const laneEnd: number[] = []
  const bars: BandBar[] = []
  for (const { item, days } of sorted) {
    const col = keys.indexOf(days[0]!)
    const span = days.length
    let lane = laneEnd.findIndex((end) => end < col)
    if (lane === -1) lane = laneEnd.length
    laneEnd[lane] = col + span - 1
    bars.push({ item, col, span, lane })
  }
  return { bars, lanes: laneEnd.length }
}

export interface PlacedItem {
  item: CalendarItem
  top: number
  height: number
  /** Side by side when they overlap: column index and how many share the cluster. */
  col: number
  cols: number
}

/** Timed items on one day: position by time, split overlapping ones into columns. */
export function layoutDay(items: CalendarItem[], key: string): PlacedItem[] {
  const dayStart = fromKey(key).getTime()
  const dayEnd = addDays(fromKey(key), 1).getTime()
  const spans = items
    .map((item) => {
      const s = Math.max(new Date(item.start).getTime(), dayStart)
      const e = Math.min(new Date(item.end).getTime(), dayEnd)
      return { item, s, e: Math.max(e, s + 15 * 60000) }
    })
    .filter((x) => x.s < dayEnd && x.e > dayStart)
    .sort((a, b) => a.s - b.s || b.e - a.e)

  const out: PlacedItem[] = []
  let cluster: { s: number; e: number; col: number; item: CalendarItem }[] = []
  let clusterEnd = -1
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1))
    for (const c of cluster) {
      const top = ((c.s - dayStart) / 3600000) * HOUR_PX
      const height = Math.max(((c.e - c.s) / 3600000) * HOUR_PX, 22)
      out.push({ item: c.item, top, height, col: c.col, cols })
    }
    cluster = []
  }
  for (const x of spans) {
    if (x.s >= clusterEnd && cluster.length) flush()
    const used = new Set(cluster.filter((c) => c.e > x.s).map((c) => c.col))
    let col = 0
    while (used.has(col)) col++
    cluster.push({ ...x, col })
    clusterEnd = Math.max(clusterEnd, x.e)
  }
  if (cluster.length) flush()
  return out
}

/** Items touching a day, all-day first, then by start. */
export function itemsOn(items: CalendarItem[], key: string): CalendarItem[] {
  return items
    .filter((i) => itemDays(i, key, key).length > 0)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.start < b.start ? -1 : 1))
}

/** ISO-8601 week number (weeks start Monday; week 1 holds the first Thursday). */
export function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = x.getUTCDay() || 7
  x.setUTCDate(x.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1))
  return Math.ceil(((x.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
