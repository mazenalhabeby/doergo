/**
 * @hbcfield/shared — support team routing.
 *
 * Pure resolver that decides WHICH support team owns a customer organization's
 * tickets. Shared so the create-time path (task-service) and the backfill script
 * (auth-service) can never drift. No I/O — callers pass the org attributes + the
 * team's rules; this only decides.
 *
 * Precedence (Zendesk-style "manual wins over automation"):
 *   1. org.supportTeamId (manual pin)  → that team
 *   2. first active routing rule (by order) whose conditions all match  → its team
 *   3. null  → unassigned "triage" queue (everyone with manageSupport sees it)
 */

export type SupportTeamRole = 'MANAGER' | 'AGENT';

/** Attributes of the customer org a rule can predicate on. All optional. */
export interface OrgRoutingAttributes {
  planTier?: string | null; // 'starter' | 'professional' | 'business' | 'enterprise'
  country?: string | null; // ISO 3166-1 alpha-2, e.g. 'AT'
  state?: string | null; // state / province / region
  industry?: string | null; // e.g. 'HVAC'
  supportTeamId?: string | null; // manual pin (wins over rules)
}

/**
 * A rule's condition set. Every present key must match (AND); within a key the
 * value list is OR-ed. An omitted/empty key means "any". Case-insensitive.
 */
export interface RoutingConditions {
  planTier?: string[];
  country?: string[];
  state?: string[];
  industry?: string[];
}

export interface SupportRoutingRuleLike {
  teamId: string;
  isActive: boolean;
  order: number;
  conditions: RoutingConditions | null | undefined;
}

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

function keyMatches(allowed: string[] | undefined, value: string | null | undefined): boolean {
  if (!allowed || allowed.length === 0) return true; // "any"
  const v = norm(value);
  if (!v) return false; // rule constrains this key but the org has no value → no match
  return allowed.some((a) => norm(a) === v);
}

/** Does an org satisfy a rule's conditions? */
export function orgMatchesConditions(
  conditions: RoutingConditions | null | undefined,
  org: OrgRoutingAttributes,
): boolean {
  if (!conditions) return true; // no conditions = catch-all
  return (
    keyMatches(conditions.planTier, org.planTier) &&
    keyMatches(conditions.country, org.country) &&
    keyMatches(conditions.state, org.state) &&
    keyMatches(conditions.industry, org.industry)
  );
}

/**
 * Resolve the owning team id for an org, or null for the triage queue.
 * `rules` may be unsorted — this sorts by `order` ascending (ties broken stably).
 */
export function resolveTeamForOrg(
  org: OrgRoutingAttributes,
  rules: SupportRoutingRuleLike[],
): string | null {
  // 1. Manual pin always wins.
  if (org.supportTeamId) return org.supportTeamId;
  // 2. First active rule (lowest order) whose conditions match.
  const active = rules
    .filter((r) => r.isActive)
    .slice()
    .sort((a, b) => a.order - b.order);
  for (const rule of active) {
    if (orgMatchesConditions(rule.conditions, org)) return rule.teamId;
  }
  // 3. Triage.
  return null;
}
