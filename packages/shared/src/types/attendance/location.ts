/** A workspace as attendance reads it: where it is, its ring, its rules. */
import type { NoShiftTag } from '../../attendance/no-shift-limit';

// ============================================================================
// COMPANY LOCATION
// ============================================================================

export interface CompanyLocation {
  /** Request kinds members may send here (requests/request-kinds.ts). Empty = every kind. */
  requestKinds?: string[] | null;
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  geofenceRadius: number;
  /**
   * The site's drawn outline, when one exists. Present on the type so every
   * client can ask `isAtSite` the same question the server asks — a client that
   * only knows about the radius shows "out of range" to somebody the server is
   * happily accepting, which is worse than showing nothing.
   */
  geofencePolygon?: { lat: number; lng: number }[] | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
  // Space configuration
  enabledModules?: string[] | null;
  workflowId?: string | null;
  workModel?: string | null; // NONE | SHIFT | FIXED | TASK — how attendance is interpreted
  // Ownership classification — PROJECT | COMPANY | CUSTOMER (orthogonal to
  // physical-vs-workspace). CUSTOMER spaces carry the contact fields below.
  kind?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  // CUSTOMER kind: per-space billable rate override (cents/hour in the
  // workspace's currency; null = fall back to the org default).
  billableRateCents?: number | null;
  /** What this workspace's client is billed in; null = the organization's. */
  currency?: string | null;
  /** The company (legal entity) that invoices this workspace; null = the organization's main one. */
  legalEntityId?: string | null;
  /** Read only (GET one): its own currency, else the organization's — what its rates are in. */
  effectiveCurrency?: string;
  /** Read only (GET one): the organization's currency — what costs here are in. */
  organizationCurrency?: string;
  /** Read only (GET one): client-facing rates set here, re-read by a currency switch. */
  ratesSet?: number;
  // Space-driven routing (Phase 3): role ids notified about / contactable by
  // members here. Empty = default to the space's leader roles.
  notifyRoleIds?: string[] | null;
  contactRoleIds?: string[] | null;
  // Structural flags — the default bucket (unassigned tasks) and the Remote
  // bucket (WFH clock-ins) can't be deleted.
  isDefault?: boolean;
  isRemote?: boolean;
  // Present on the single-space detail response (findOne includes _count).
  _count?: { tasks: number };
  /**
   * The ceiling on working away from this site: STRICT | AWAY_ALLOWED | NONE.
   *
   * A fact about the place, never a permission — see
   * packages/shared/src/attendance/away-policy.ts.
   */
  geofencePolicy?: string | null;
  /**
   * The staffing floor: how many people must be on the floor here on a working
   * day. 0 means NOT SET, never "nobody needed" — with no floor the leave chart
   * reports the count and passes no judgement on it.
   */
  minCover?: number;
  /**
   * Whether the CALLER may clock in here without being on site.
   *
   * Only present on the clock-in list, where the server answers it with the
   * same rule the clock-in refuses by — the site's ceiling and this member's
   * grant. Undefined elsewhere: it is a fact about a person and a place
   * together, not a property of the place.
   */
  awayAllowed?: boolean;
  /** Clocking in here with no shift: ALLOW | LIMIT | SHIFT_ONLY — see attendance/no-shift-limit.ts. */
  noShiftPolicy?: string | null;
  noShiftDailyMinutes?: number | null;
  /**
   * The caller's allowance here with no shift, as the server read it. Only on
   * the clock-in list and status; null where the workspace allows it freely.
   */
  noShift?: NoShiftTag | null;
  /** On the clock-in list and status: a shift for the caller here now, and their primary workspace. */
  shiftToday?: boolean;
  isPrimary?: boolean;
}
