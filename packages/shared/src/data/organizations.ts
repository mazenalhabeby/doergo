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

/** The organization's currency. */
export function orgCurrency(db: OrgDb, organizationId: string) {
  return db.organization.findUnique({ where: { id: organizationId }, select: { currency: true } });
}

/** Organization names by id. */
export function orgNames(db: On<'organization', 'findMany'>, ids: string[]) {
  return db.organization.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
}

/** Every organization that is switched on and not suspended, with its timezone — the nightly jobs. */
export function liveOrgZones(db: On<'organization', 'findMany'>) {
  return db.organization.findMany({
    where: { isActive: true, suspendedAt: null },
    select: { id: true, timezone: true },
  });
}

/** The organization's default bill and cost rates. */
export function orgRates(db: OrgDb, organizationId: string) {
  return db.organization.findUnique({
    where: { id: organizationId },
    select: { billableRateCents: true, costRateCents: true },
  });
}

/** What the calendar's day rules start from: the organization's weekend, holiday place and country. */
export function orgCalendarRules(db: OrgDb, organizationId: string) {
  return db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, weekendDays: true, holidayCountry: true, holidayRegion: true, country: true },
  });
}

/** The organization's calendar settings (weekend, holiday place, feeds switch). */
export function orgCalendarSettings(db: OrgDb, organizationId: string) {
  return db.organization.findUnique({
    where: { id: organizationId },
    select: { weekendDays: true, holidayCountry: true, holidayRegion: true, country: true, calendarFeedsEnabled: true },
  });
}

/** Where the organization's holidays come from (country, region; its own country as the fallback). */
export function orgHolidayPlace(db: OrgDb, organizationId: string) {
  return db.organization.findUnique({
    where: { id: organizationId },
    select: { holidayCountry: true, holidayRegion: true, country: true },
  });
}
