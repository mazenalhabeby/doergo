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
 *     Access Profile grants web/both). Priced BY TIER (€29/€59/€99).
 *   • field seat  — a member with MOBILE-ONLY access. Flat €19.
 *
 * Whenever a member's Access Profile changes (web access granted/revoked), their
 * seat type flips — so the billing layer must re-count and re-sync Stripe
 * quantities on every access change (+ a periodic reconcile job as backstop).
 */

import { getAccessPlatforms } from '../types/modules';
import type { SeatType } from './plans';

/** Minimal shape needed to classify a user's seat. */
export interface SeatClassifiable {
  role?: string | null;
  isActive?: boolean | null;
  /** Access Profile / modules blob (object or legacy array), same field the app already uses. */
  enabledModules?: unknown;
}

/** Roles that are always office seats (full web access), incl. legacy aliases. */
function isAdminRole(role?: string | null): boolean {
  const r = (role ?? '').toUpperCase();
  return r === 'ADMIN' || r === 'CLIENT';
}

/**
 * Classify a single user into a billable seat type.
 * Admins are always office seats; everyone else is office if they can reach the
 * web portal, field if they are mobile-only.
 */
export function classifySeat(user: SeatClassifiable): SeatType {
  if (isAdminRole(user.role)) return 'office';
  // getAccessPlatforms defaults to 'both' when a user has no explicit Access
  // Profile — so unconfigured members count as office (safe, higher-priced) until
  // an admin scopes them to mobile-only.
  return getAccessPlatforms(user) === 'mobile' ? 'field' : 'office';
}

export interface SeatCounts {
  office: number;
  field: number;
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
  for (const u of users) {
    if (u.isActive === false) continue;
    if (classifySeat(u) === 'office') office += 1;
    else field += 1;
  }
  return { office, field, total: office + field };
}
