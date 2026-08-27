/*
  Overtime approval is a race, and the screen was not showing the clock.

  A request expires if nobody answers inside the approval window, and the card
  said "1 minute ago" — when it ARRIVED, not how long is left. Those are
  different facts, and only one of them tells a manager whether to deal with
  this now or finish their coffee. An approval that quietly expires costs the
  technician their overtime and the company an unresolved job.
*/

/** Milliseconds until a deadline; negative once it has passed. */
export function msLeft(deadline?: string | Date | null, now = Date.now()): number | null {
  if (!deadline) return null
  const t = new Date(deadline).getTime()
  return Number.isNaN(t) ? null : t - now
}

/** "6:04" — minutes and seconds, because a window this short is counted in both. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export type Urgency = "expired" | "critical" | "warning" | "calm"

/**
 * Under a minute is critical, under three is a warning.
 *
 * Tuned to the ten-minute approval window: a colour that turns red at the
 * halfway mark cries wolf on every request, and one that waits until the last
 * ten seconds is decoration.
 */
export function urgencyOf(ms: number | null): Urgency {
  if (ms === null) return "calm"
  if (ms <= 0) return "expired"
  if (ms < 60_000) return "critical"
  if (ms < 180_000) return "warning"
  return "calm"
}

/** How long the shift had already run when overtime was asked for. */
export function shiftLength(clockInAt?: string | Date | null, until: Date | number = Date.now()): string | null {
  if (!clockInAt) return null
  const start = new Date(clockInAt).getTime()
  if (Number.isNaN(start)) return null
  const mins = Math.max(0, Math.round((Number(until) - start) / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`
}

/**
 * A shift long enough that the overtime itself deserves a second look.
 *
 * Ten hours is the Austrian daily maximum under normal working-time rules, so
 * an approver crossing it is making a different decision from one adding an
 * hour to a seven-hour day — and should be able to see that without doing
 * arithmetic on a clock-in time.
 */
export function isLongShift(clockInAt?: string | Date | null, until: Date | number = Date.now()): boolean {
  if (!clockInAt) return false
  const start = new Date(clockInAt).getTime()
  if (Number.isNaN(start)) return false
  return Number(until) - start >= 10 * 3_600_000
}
