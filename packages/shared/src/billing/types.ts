/**
 * Billing API contract — DTO/view shapes and status helpers shared by the web
 * app, mobile app and backend so the wire format has one definition.
 *
 * NOTE: lowercase string unions here mirror `plans.ts` (marketing-friendly, good
 * config keys). The Prisma enums are UPPERCASE; the backend maps between them.
 */

import type { PlanTier, BillingInterval } from './plans';

/** Subscription lifecycle status. */
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

/** What the client renders. All money in EUR cents. */
export interface SubscriptionView {
  planTier: PlanTier | null;
  status: SubStatus;
  interval: BillingInterval;
  officeSeats: number;
  /** External/freelancer field seats (€15). */
  fieldSeats: number;
  /** In-house (employed) field seats (€9 discount). */
  fieldInhouseSeats: number;
  /** Recurring total for the current line-up (null for enterprise/custom). */
  totalCents: number | null;
  trialEndsAt: string | null; // ISO
  currentPeriodEnd: string | null; // ISO
  cancelAtPeriodEnd: boolean;
  /** True when write access is blocked (see isLocked). */
  locked: boolean;
  /** Convenience: days left in trial (null if not trialing). */
  trialDaysLeft: number | null;
}

/** Client → server: start checkout for a self-serve tier. */
export interface CheckoutRequest {
  tier: Exclude<PlanTier, 'enterprise'>;
  interval: BillingInterval;
}

/** Client → server: change the active plan/interval. */
export interface ChangePlanRequest {
  tier: Exclude<PlanTier, 'enterprise'>;
  interval: BillingInterval;
}

/** Statuses that still allow full use of the product. */
export function isBillingActive(status: SubStatus): boolean {
  // past_due keeps access during the dunning grace period; the lock only lands
  // once retries are exhausted (handled server-side by moving to canceled/incomplete).
  return status === 'trialing' || status === 'active' || status === 'past_due';
}

/** Statuses that lock the org to read-only. */
export function isLocked(status: SubStatus): boolean {
  return status === 'incomplete' || status === 'canceled';
}

/** Days remaining in a trial (0 if past, null if no trial end). */
export function trialDaysLeft(trialEndsAt: string | Date | null | undefined, now: Date): number | null {
  if (!trialEndsAt) return null;
  const end = typeof trialEndsAt === 'string' ? new Date(trialEndsAt) : trialEndsAt;
  const ms = end.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
