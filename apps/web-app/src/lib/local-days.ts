/**
 * Day arithmetic on the viewer's own calendar — what the task timeline, the
 * epic roadmap and the month grids lay their columns out by. Local midnight,
 * local weekday: these place things on a screen, they never key data.
 */

/** Local midnight of `d`. */
export function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

/** `n` calendar days later (earlier when negative), keeping the wall-clock time across DST. */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Whole days from `b` to `a`, rounded so a DST hour does not cost a day. */
export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}
