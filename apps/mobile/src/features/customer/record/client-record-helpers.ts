import { type MobileCustomerActivity } from '../../../lib/api';
import type { MobileCustomerContact } from '../../../lib/api/customers';
import { type PendingContactLink } from '../../../offline/crm/client-overlay';

/** The record's tabs, filters and ordering — moved here unchanged from use-client-record.ts. */
export const TABS = ['information', 'activity', 'reminders'] as const;

export type RecordTab = (typeof TABS)[number];

export const isTab = (v: unknown): v is RecordTab => typeof v === 'string' && (TABS as readonly string[]).includes(v);

/** What the Activity feed is narrowed to. A note and a call are the two kinds a member files. */
export const FILTERS = [
  { key: 'all', label: 'customers.record.filter.all', types: null },
  { key: 'notes', label: 'customers.record.filter.notes', types: ['NOTE'] },
  { key: 'calls', label: 'customers.record.filter.calls', types: ['CALL'] },
] as const;

export type ActivityFilter = (typeof FILTERS)[number]['key'];

/**
 * A contact row that exists only in the outbox. It carries the OPERATION's id
 * rather than a link id — there is no link until the server mints one — which
 * decides both what "remove" means on it and whether the star is offered.
 */
export const isWaiting = (link: MobileCustomerContact | PendingContactLink): link is PendingContactLink =>
  (link as PendingContactLink).waiting === true;

export const isOverdue = (a: MobileCustomerActivity, now: number) =>
  a.type === 'REMINDER' && !!a.dueAt && !a.doneAt && new Date(a.dueAt).getTime() < now;

/** Soonest first, so whatever is most overdue is the first thing on the tab. */
export function byDue(a: MobileCustomerActivity, b: MobileCustomerActivity): number {
  const av = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bv = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  return av - bv;
}
