/**
 * Seat classification & counting — the core of "how do we bill a dynamic member?".
 *
 * HBCField has 2 product roles: ADMIN and MEMBER. A MEMBER is fully dynamic — its
 * capabilities come from a per-user Access Profile (stored on User.enabledModules),
 * NOT from a fixed role like "dispatcher". So a member can be an office coordinator
 * (web access) or a field technician (mobile-only), and can switch between them.
 *
 * Therefore the BILLABLE SEAT TYPE is derived from ACCESS, not role:
 *   • office seat — anyone who can reach the WEB portal (ADMIN, or a member whose
 *     Access Profile grants web/both). Priced BY TIER (€19/€49/€99).
 *   • field seat  — a MOBILE-ONLY member who is EXTERNAL/freelance. Flat €15.
 *   • in-house field seat — a MOBILE-ONLY member the org EMPLOYS in-house
 *     (`employmentType === 'IN_HOUSE'`). Discounted flat €9.
 *
 * The office/field split follows ACCESS (web vs mobile-only); the external vs
 * in-house split of a field seat follows the member's `employmentType`. Whenever
 * either changes, the billing layer must re-count and re-sync Stripe quantities
 * (on every access/employment change + a periodic reconcile job as backstop).
 */

import { getAccessPlatforms } from '../types/modules';
import type { SeatType } from './plans';

/** A member employed in-house by the org gets the discounted field seat. */
export type EmploymentType = 'IN_HOUSE' | 'EXTERNAL';

/** Minimal shape needed to classify a user's seat. */
export interface SeatClassifiable {
  role?: string | null;
  isActive?: boolean | null;
  /** Access Profile / modules blob (object or legacy array), same field the app already uses. */
  enabledModules?: unknown;
  /** 'IN_HOUSE' → discounted field seat; anything else → external field seat. */
  employmentType?: string | null;
}

/** Roles that are always office seats (full web access), incl. legacy aliases. */
function isAdminRole(role?: string | null): boolean {
  const r = (role ?? '').toUpperCase();
  return r === 'ADMIN' || r === 'CLIENT';
}

/** Whether a member is employed in-house (→ discounted field seat). */
export function isInHouse(user: SeatClassifiable): boolean {
  return (user.employmentType ?? '').toUpperCase() === 'IN_HOUSE';
}

/**
 * Classify a single user into a billable seat type.
 * Admins are always office seats; everyone else is office if they can reach the
 * web portal. A mobile-only member is a field seat — in-house (discounted) when
 * `employmentType === 'IN_HOUSE'`, otherwise external.
 */
export function classifySeat(user: SeatClassifiable): SeatType {
  if (isAdminRole(user.role)) return 'office';
  // getAccessPlatforms defaults to 'both' when a user has no explicit Access
  // Profile — so unconfigured members count as office (safe, higher-priced) until
  // an admin scopes them to mobile-only.
  if (getAccessPlatforms(user) !== 'mobile') return 'office';
  return isInHouse(user) ? 'field_inhouse' : 'field';
}

export interface SeatCounts {
  office: number;
  /** External/freelancer field seats (€15). */
  field: number;
  /** In-house (employed) field seats (€9). */
  fieldInhouse: number;
  total: number;
}

/**
 * Count billable seats for an organization from its member list.
 * Only ACTIVE users are billed (isActive !== false). Deactivated members free
 * their seat.
 */
export function countSeats(users: SeatClassifiable[]): SeatCounts {
  let office = 0;
  let field = 0;
  let fieldInhouse = 0;
  for (const u of users) {
    if (u.isActive === false) continue;
    const seat = classifySeat(u);
    if (seat === 'office') office += 1;
    else if (seat === 'field_inhouse') fieldInhouse += 1;
    else field += 1;
  }
  return { office, field, fieldInhouse, total: office + field + fieldInhouse };
}
