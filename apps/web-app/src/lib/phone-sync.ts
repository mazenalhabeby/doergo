import { personName, type SyncHealthState, type SyncMemberHealth } from '@hbcfield/shared/client'

/**
 * Reading a phone's sync report for the office.
 *
 * The STATE comes from the server (`syncHealthState` in shared, the same rule
 * the alert uses). What lives here is presentation: the order rows are worth
 * looking at, and what a reason code means to somebody who is not a developer.
 */

/** Worst first — the order the summary chips and the table read in. */
export const PHONE_SYNC_STATES: readonly SyncHealthState[] = ['stuck', 'needs_member', 'sending', 'silent', 'up_to_date']

export function countByState(rows: readonly Pick<SyncMemberHealth, 'state'>[]): Record<SyncHealthState, number> {
  const counts: Record<SyncHealthState, number> = { stuck: 0, needs_member: 0, sending: 0, silent: 0, up_to_date: 0 }
  for (const r of rows) counts[r.state]++
  return counts
}

/*
  Reason codes, as the phone recorded them, to the words the office reads.

  Two kinds arrive: the phone's own (no signal, waiting for Wi-Fi, a photo gone
  from the phone) and the server's refusals (the job was reassigned, the shift
  was already closed). Anything not listed still gets a readable line — a code
  added on the server next month must not render as a blank row.
*/
const KNOWN_REASONS = new Set([
  'NETWORK',
  'NO_RESULT',
  'WAITING_FOR_WIFI',
  'UNAUTHENTICATED',
  'UPLOAD_FAILED',
  'FILE_MISSING',
  'PHOTO_REFUSED',
  'DEPENDENCY_FAILED',
  'CONFLICT',
  'TASK_STATE_CONFLICT',
  'TASK_REASSIGNED',
  'ALREADY_CLOCKED_IN',
  'ENTRY_ALREADY_CLOSED',
  'BREAK_ALREADY_ENDED',
  'OUT_OF_ORDER',
  'OCCURRED_IN_FUTURE',
  'FIX_NOT_AT_TAP',
  'FIX_INACCURATE',
  'FIX_MISSING',
  'REPORT_EXISTS',
])

/** The i18n key under `members.phoneSync.reasons` for a code. */
export function reasonKey(code: string): string {
  if (KNOWN_REASONS.has(code)) return code
  if (/^HTTP_5\d\d$/.test(code) || code === 'HTTP_429') return 'SERVER_BUSY'
  return 'OTHER'
}

/** Reasons with their counts, the most frequent first. */
export function reasonsOf(codes: Record<string, number>): { code: string; key: string; count: number }[] {
  return Object.entries(codes)
    .filter(([, n]) => n > 0)
    .map(([code, count]) => ({ code, key: reasonKey(code), count }))
    .sort((a, b) => b.count - a.count)
}

/** "31 h", "4 min", "3 d" — how long something has been waiting. */
export function formatAge(fromMs: number, nowMs: number, locale?: string): string {
  const minutes = Math.max(0, Math.round((nowMs - fromMs) / 60000))
  const unit = minutes < 60 ? 'minute' : minutes < 48 * 60 ? 'hour' : 'day'
  const value = unit === 'minute' ? minutes : unit === 'hour' ? Math.round(minutes / 60) : Math.round(minutes / 1440)
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value)
}

/** Does this row match a search for a person? Name or email, any order of words. */
export function matchesSearch(person: { firstName?: string; lastName?: string; email?: string } | undefined, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (!person) return false
  const hay = `${personName(person)} ${person.email ?? ''}`.toLowerCase()
  return q.split(/\s+/).every((word) => hay.includes(word))
}
