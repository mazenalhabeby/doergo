import {
  AUTO_CLOCK_DEFAULTS,
  AUTO_CLOCK_LIMITS,
  parseAutoClockSettings,
  type AutoClockSettings,
} from "@hbcfield/shared/client"

/**
 * The automatic clock on the web — the words and the form around the shared
 * contract (`packages/shared/src/attendance/auto-clock.ts`), never a second
 * copy of its rules. Whether a number is allowed is answered ONLY by
 * `parseAutoClockSettings(…, { strict: true })`, the same function the server
 * refuses by, so the form cannot accept what the server will 400.
 *
 * Pure — no React. The workspace section and the Members panel read it.
 */

export type AutoClockField = keyof typeof AUTO_CLOCK_LIMITS

/** The fields in the order the form asks them — arrival, departure, rest, nobody answered. */
export const AUTO_CLOCK_FIELDS: readonly AutoClockField[] = [
  "leadMinutes",
  "dwellMinutes",
  "exitGraceMinutes",
  "autoRestMinutes",
  "leaderAfterMinutes",
  "closeAfterMinutes",
]

/** i18n keys of one field's label and its one-line hint. */
export const autoClockFieldLabelKey = (f: AutoClockField) => `attendance.autoClock.fields.${f}.label`
export const autoClockFieldHintKey = (f: AutoClockField) => `attendance.autoClock.fields.${f}.hint`

/**
 * What the workspace has saved, read leniently (a stored value outside today's
 * limits takes the default). `undefined` — an older server that does not send
 * the field — and `null` both read as OFF.
 */
export function savedAutoClock(raw: unknown): AutoClockSettings {
  if (raw == null) return { ...AUTO_CLOCK_DEFAULTS }
  const r = parseAutoClockSettings(raw)
  return r.ok ? r.value : { ...AUTO_CLOCK_DEFAULTS }
}

/** The form's state: what was typed, as typed. The rest is "" when it is off. */
export type AutoClockForm = Record<AutoClockField, string> & { restOn: boolean }

export function autoClockForm(s: AutoClockSettings): AutoClockForm {
  const rest = s.autoRestMinutes
  return {
    leadMinutes: String(s.leadMinutes),
    dwellMinutes: String(s.dwellMinutes),
    exitGraceMinutes: String(s.exitGraceMinutes),
    // Switching the rest on offers a sensible length rather than an empty box.
    autoRestMinutes: String(rest ?? 30),
    restOn: rest != null,
    leaderAfterMinutes: String(s.leaderAfterMinutes),
    closeAfterMinutes: String(s.closeAfterMinutes),
  }
}

/**
 * The form as the body `PATCH /locations/:id` takes, judged by the shared
 * strict parser. Text that is not a whole number goes through as NaN so the
 * parser refuses it with that field's name — never quietly clamped or dropped.
 */
export function autoClockSubmission(
  form: AutoClockForm,
  enabled: boolean,
): { ok: true; value: AutoClockSettings } | { ok: false; field: AutoClockField } {
  const num = (v: string) => (/^\s*\d+\s*$/.test(v) ? Number(v) : Number.NaN)
  const raw = {
    enabled,
    leadMinutes: num(form.leadMinutes),
    dwellMinutes: num(form.dwellMinutes),
    exitGraceMinutes: num(form.exitGraceMinutes),
    autoRestMinutes: form.restOn ? num(form.autoRestMinutes) : null,
    leaderAfterMinutes: num(form.leaderAfterMinutes),
    closeAfterMinutes: num(form.closeAfterMinutes),
  }
  const r = parseAutoClockSettings(raw, { strict: true })
  return r.ok ? { ok: true, value: r.value } : { ok: false, field: r.field as AutoClockField }
}

/** Has the form moved away from what is saved? (enabled is saved by its own switch) */
export function autoClockDirty(form: AutoClockForm, saved: AutoClockSettings): boolean {
  // The rest's length means nothing while the rest is off.
  const norm = (f: AutoClockForm) =>
    AUTO_CLOCK_FIELDS.map((k) => (k === "autoRestMinutes" && !f.restOn ? "off" : f[k].trim())).join("|")
  return norm(form) !== norm(autoClockForm(saved))
}

/**
 * The sentence for a refused field. `closeAfterMinutes` can also be refused
 * for not being after the leader's notice — the one rule between two fields.
 */
export function autoClockFieldError(field: AutoClockField, form: AutoClockForm): { key: string; params: Record<string, number> } {
  const [min, max] = AUTO_CLOCK_LIMITS[field]
  const n = Number(form[field])
  if (field === "closeAfterMinutes" && Number.isInteger(n) && n >= min && n <= max) {
    return { key: "attendance.autoClock.errorAfterLeader", params: {} }
  }
  return { key: "attendance.autoClock.errorRange", params: { min, max } }
}

/**
 * Can this workspace use the automatic clock at all?
 *
 * - `remote`: the Remote bucket has no place to enter or leave — the section is not offered.
 * - `noCoordinates`: a workspace with no map point has no area to arm; said, not hidden,
 *   so the office knows what to fix (General → address / map point).
 */
type AutoClockAvailability = "ok" | "remote" | "noCoordinates"

export function autoClockAvailability(
  space: { isRemote?: boolean | null; lat?: number | null; lng?: number | null }): AutoClockAvailability {
  if (space.isRemote) return "remote"
  if (space.lat == null || space.lng == null) return "noCoordinates"
  return "ok"
}

/**
 * A member's consent as the office reads it. `unknown` when the server did not
 * send the field (an older server) — say nothing rather than claim "not agreed".
 */
type AutoClockConsent = { state: "agreed"; at: string } | { state: "notAgreed" } | { state: "unknown" }

export function autoClockConsent(
  row: { autoClockConsentAt?: string | null; user?: { autoClockConsentAt?: string | null } | null } | null | undefined): AutoClockConsent {
  const v = row?.autoClockConsentAt !== undefined ? row.autoClockConsentAt : row?.user?.autoClockConsentAt
  if (v === undefined) return { state: "unknown" }
  return v ? { state: "agreed", at: v } : { state: "notAgreed" }
}
