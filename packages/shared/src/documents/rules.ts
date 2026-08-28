/**
 * The rules of the personnel file — pure functions, no I/O, no dates from the
 * ambient clock.
 *
 * Every function here takes `now` as an argument rather than calling
 * `new Date()` internally. That is not ceremony: a credential that expires
 * "today" behaves differently at 00:01 and 23:59, the expiry sweep runs at
 * 02:00 in one timezone about members in another, and a test that cannot fix
 * the clock cannot assert on any of it.
 */

import type {
  CredentialStanding,
  DocumentCadence,
  DocumentDirection,
  DocumentTypeDef,
  SignatureMode,
} from './types';

/** Days before expiry at which we warn. Order here does not matter. */
export const CREDENTIAL_REMINDER_DAYS = [60, 30, 7] as const;

/** A credential this close to expiry counts as EXPIRING rather than VALID. */
export const CREDENTIAL_EXPIRING_WINDOW_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `now` until `date`. Negative once the date has passed. */
export function daysUntil(date: Date | string, now: Date): number {
  const target = typeof date === 'string' ? new Date(date) : date;
  // Compare calendar days, not elapsed milliseconds: a licence expiring
  // tomorrow at 09:00 is "1 day left" all of today, not "0" from 09:01.
  const a = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / DAY_MS);
}

/**
 * Where a credential stands.
 *
 * A credential with no expiry date is VALID forever — some qualifications
 * genuinely do not lapse, and forcing a fake date on them would produce fake
 * alerts. `null` expiry means "no expiry", never "unknown".
 */
export function credentialStanding(
  expiresOn: Date | string | null | undefined,
  now: Date,
  windowDays: number = CREDENTIAL_EXPIRING_WINDOW_DAYS,
): CredentialStanding {
  if (!expiresOn) return 'VALID';
  const left = daysUntil(expiresOn, now);
  if (left < 0) return 'EXPIRED';
  if (left <= windowDays) return 'EXPIRING';
  return 'VALID';
}

/**
 * Whether this credential blocks assignment to a given task type.
 *
 * Deliberately strict: only an EXPIRED credential blocks. An EXPIRING one warns
 * loudly and blocks nothing, because a dispatcher losing a technician a month
 * early causes exactly the scramble the feature exists to prevent.
 */
export function credentialBlocks(standing: CredentialStanding): boolean {
  return standing === 'EXPIRED' || standing === 'MISSING';
}

/**
 * Which reminder a credential is currently due for, or null.
 *
 * Returns the NARROWEST threshold the credential has reached — the smallest
 * configured value that is still at or above the days remaining. At 45 days out
 * only the 60-day mark has been passed, so the answer is 60; at 20 days the
 * 30-day mark has been passed too, so it is 30; from 7 days down it is 7.
 *
 * Callers record which thresholds they have already sent, so a credential sat
 * at "30" for three weeks produces one message, not twenty-one. This function
 * only says which reminder today qualifies for.
 *
 * Iterates ascending regardless of how CREDENTIAL_REMINDER_DAYS is written, so
 * reordering that constant cannot silently change the answer.
 */
export function reminderDueAt(daysLeft: number): number | null {
  if (daysLeft < 0) return null; // already expired: that is a different message
  const ascending = [...CREDENTIAL_REMINDER_DAYS].sort((a, b) => a - b);
  for (const threshold of ascending) {
    if (daysLeft <= threshold) return threshold;
  }
  return null;
}

/**
 * When a document may be deleted, or null for "keep indefinitely".
 *
 * Null is a real answer, not a missing one: a written employment reference must
 * be producible for thirty years in Austria, which is long enough that "never
 * delete automatically" is the honest implementation.
 */
export function retentionUntil(
  issuedAt: Date,
  retentionMonths: number | null | undefined,
): Date | null {
  if (!retentionMonths || retentionMonths <= 0) return null;
  const d = new Date(issuedAt.getTime());
  d.setUTCMonth(d.getUTCMonth() + retentionMonths);
  return d;
}

/** Whether a member may delete this document themselves. */
export function memberMayDelete(direction: DocumentDirection): boolean {
  // Only what the member supplied. A payslip they could remove is not a record.
  return direction === 'SUPPLIED';
}

/** Whether this document blocks the member until they act on it. */
export function isBlocking(mode: SignatureMode): boolean {
  return mode === 'IN_APP' || mode === 'ACKNOWLEDGE';
}

/** Whether this document may be signed inside the app at all. */
export function canSignInApp(mode: SignatureMode): boolean {
  return mode === 'IN_APP';
}

/**
 * Does a period (year/month) make sense for this cadence?
 *
 * Rejecting the wrong shape here keeps the list UI honest: a MONTHLY type whose
 * rows have no month cannot group by month, and an ONE_OFF contract stamped
 * with "August" invents a period that does not exist.
 */
export function periodIsValid(
  cadence: DocumentCadence,
  year: number | null | undefined,
  month: number | null | undefined,
): boolean {
  switch (cadence) {
    case 'MONTHLY':
      return !!year && !!month && month >= 1 && month <= 12;
    case 'ANNUAL':
      return !!year && (month === null || month === undefined);
    case 'ONE_OFF':
      return (year === null || year === undefined) && (month === null || month === undefined);
  }
}

/**
 * Sort key for a document row: newest first, stable across cadences.
 *
 * Returned as a number so callers can sort a mixed list without branching on
 * cadence. Undated documents fall back to their issue date, which is why this
 * takes it as a required argument.
 */
export function periodSortKey(
  year: number | null | undefined,
  month: number | null | undefined,
  issuedAt: Date,
): number {
  if (year) return year * 100 + (month ?? 0);
  return issuedAt.getUTCFullYear() * 100 + (issuedAt.getUTCMonth() + 1);
}

/**
 * The years present in a set of documents, newest first.
 *
 * Drives the year picker. Built from what actually exists rather than a range,
 * so the picker never offers a year with nothing behind it.
 */
export function availableYears(
  docs: { periodYear: number | null; issuedAt: string | Date }[],
): number[] {
  const years = new Set<number>();
  for (const d of docs) {
    const y =
      d.periodYear ?? new Date(typeof d.issuedAt === 'string' ? d.issuedAt : d.issuedAt).getUTCFullYear();
    if (Number.isFinite(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Which credential types an organization has that gate a given task type.
 *
 * The dispatch gate calls this BEFORE touching the database. An organization
 * with no credential types gets an empty array and the gate returns
 * immediately — which is every existing organization on the day this ships, so
 * their assignment path is provably unchanged.
 */
export function credentialTypesGating(
  types: Pick<DocumentTypeDef, 'id' | 'isCredential' | 'isActive' | 'requiredForWorkflowIds'>[],
  workflowId: string | null | undefined,
): string[] {
  if (!workflowId) return [];
  return types
    .filter((t) => t.isCredential && t.isActive && t.requiredForWorkflowIds.includes(workflowId))
    .map((t) => t.id);
}
