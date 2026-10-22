/**
 * Published reads of auth-service's platform tables for support (`PlatformUser`, `Organization` as a
 * support customer, `SupportRoutingRule`) — see db.ts. Owner: auth-service.
 */
import { PERSON_BRIEF_SELECT } from '../api/person-search';
import type { On } from './db';

/** Operators by id: name and address. */
export function operatorNames(db: On<'platformUser', 'findMany'>, ids: string[]) {
  return db.platformUser.findMany({ where: { id: { in: ids } }, select: PERSON_BRIEF_SELECT });
}

/** What routes an organization's ticket: its plan, place, industry and pinned team. */
export function orgSupportFacts(db: On<'organization', 'findUnique'>, organizationId: string) {
  return db.organization.findUnique({
    where: { id: organizationId },
    select: { planTier: true, country: true, state: true, industry: true, supportTeamId: true },
  });
}

/** The routing rules that are switched on, in order. */
export function activeSupportRoutingRules(db: On<'supportRoutingRule', 'findMany'>) {
  return db.supportRoutingRule.findMany({
    where: { isActive: true },
    select: { teamId: true, isActive: true, order: true, conditions: true },
    orderBy: { order: 'asc' },
  });
}
