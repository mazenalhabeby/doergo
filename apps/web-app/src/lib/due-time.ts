/*
  ⚠️ The /client entry, never the bare package. `@hbcfield/shared` re-exports the
  microservices layer, so importing a single date helper from it pulls NestJS —
  and therefore @grpc/proto-loader — into the browser bundle and the build fails
  outright. An import is a module, not a symbol.
*/
import { hasAppointmentTime } from "@hbcfield/shared/client"

/**
 * A due date that may or may not carry an hour.
 *
 * Three places let somebody set one — the create dialog, the edit dialog and
 * the sidebar's inline field — and each needs the same three answers: does this
 * value have a time, what is it, and how do I put one on. Written once, because
 * three copies of "combine a date and HH:mm" is three chances to be an hour out.
 *
 * ⚠️ Midnight means "no hour given", not "be there at 00:00". Every task made
 * before appointment times existed carries midnight, and the phone counts down
 * to a departure only for jobs that name an hour — so a date picked with no
 * time must keep producing midnight exactly as it always did.
 *
 * ⚠️ The hour is read and written in the BROWSER's zone, which is the zone the
 * person typing it is thinking in. It is stored as an instant, so a member in
 * another zone sees the same moment rendered in theirs. Rendering it in the
 * SITE's zone instead is a further refinement and deliberately not pretended at
 * here.
 */

/** Minutes to add to UTC to reach this browser's wall clock. */
const browserOffset = (d: Date) => -d.getTimezoneOffset()

/** Does this value name an hour, or is it only a date? */
export function hasTime(value?: string | Date | null): boolean {
  if (!value) return false
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return false
  return hasAppointmentTime(d, browserOffset(d))
}

/** "13:00", or "" when the value carries no hour. */
export function timeOf(value?: string | Date | null): string {
  if (!hasTime(value)) return ""
  const d = value instanceof Date ? value : new Date(value!)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** A calendar date plus "HH:mm" → the instant. An empty time leaves midnight. */
export function withTime(date: Date | undefined, hhmm: string): Date | undefined {
  if (!date) return undefined
  const out = new Date(date)
  const [h, m] = hhmm.split(":").map(Number)
  out.setHours(hhmm && Number.isFinite(h) ? h : 0, hhmm && Number.isFinite(m) ? m : 0, 0, 0)
  return out
}

/** "Sep 10, 2026" — or "Sep 10, 2026 · 13:00" when an hour was named. */
export function formatDue(value: string | Date | null | undefined, locale: string): string {
  if (!value) return ""
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const day = d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })
  return hasTime(d) ? `${day} · ${timeOf(d)}` : day
}
