/**
 * Published reads of auth-service's `Organization` table — one setting per question, in the shape the
 * query always had (`{ timezone } | null`), see db.ts. Owner: auth-service.
 */
import type { On } from './db';

type OrgDb = On<'organization', 'findUnique'>;

/** The organization's timezone. */
export function orgTimezone(db: OrgDb, organizationId: string) {
  return db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
}

/** The organization's modules (the fallback for a workspace without its own). */
export function orgModules(db: OrgDb, organizationId: string) {
  return db.organization.findUnique({ where: { id: organizationId }, select: { enabledModules: true } });
}

/** May the organization's members subscribe to calendar feeds? */
export function orgCalendarFeeds(db: OrgDb, organizationId: string) {
  return db.organization.findUnique({ where: { id: organizationId }, select: { calendarFeedsEnabled: true } });
}
