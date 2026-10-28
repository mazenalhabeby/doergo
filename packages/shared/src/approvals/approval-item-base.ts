/**
 * What every inbox item is built from: the caller's context, the small readers
 * a row's fields go through, and the one constructor that asks `mayDecide`.
 */
import type { ApprovalGroup, ApprovalItem, ApprovalKind } from './approval-kinds';

export interface ApprovalContext {
  now: Date;
  /** The caller's user id. */
  me: string;
  /** May the caller decide this kind here — the gateway answers it with the same rule its guard reads. */
  mayDecide: (kind: ApprovalKind, spaceId: string | null) => boolean;
  /** The organization's currency — an expense carries none of its own. */
  currency?: string | null;
  /** The organization's time zone — "today" for dates already passed (absent = UTC). */
  timeZone?: string | null;
}

/**
 * One row of a kind's OWN list route, as the inbox reads it. Loose on purpose: thirteen kinds,
 * each read through its existing route (self-dispatch), each normalizer picking the few fields
 * it shows. Typing it means a response type per kind's route — not done yet (CODE_AUDIT §12).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
export const nameOf = (p: Row | null | undefined, fallback = ''): string =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || p.email || fallback : fallback;
export const person = (p: Row | null | undefined, fallbackName = '') => ({
  id: (p?.id as string) ?? null,
  name: nameOf(p, fallbackName),
  avatarUrl: (p?.avatarUrl as string | null | undefined) ?? null,
});
export const spaceOf = (s: Row | null | undefined) => (s?.id ? { id: String(s.id), name: String(s.name ?? '') } : null);
export const HOUR = 3_600_000;
export const within = (at: string | null, now: Date, ms: number) =>
  !!at && new Date(at).getTime() - now.getTime() <= ms;

/**
 * A no-show is urgent only while it can still change something: the shift is
 * running (somebody should be there NOW), or it ended within the day. Last
 * week's is a record to tidy, not an emergency.
 */
export function noShowGroup(end: string | null, now: Date): ApprovalGroup {
  if (!end) return 'LATER';
  const left = new Date(end).getTime() - now.getTime();
  if (left > 0) return 'NOW';
  return -left < 18 * HOUR ? 'TODAY' : 'LATER';
}

export function item(
  kind: ApprovalKind,
  ctx: ApprovalContext,
  base: Omit<ApprovalItem, 'kind' | 'canDecide' | 'group'> & { group: ApprovalGroup },
): ApprovalItem {
  return { kind, ...base, canDecide: ctx.mayDecide(kind, base.space?.id ?? null) };
}
