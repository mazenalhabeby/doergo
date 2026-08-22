/**
 * Billing API contract — DTO/view shapes and status helpers shared by the web
 * app, mobile app and backend so the wire format has one definition.
 *
 * NOTE: lowercase string unions here mirror `plans.ts` (marketing-friendly, good
 * config keys). The Prisma enums are UPPERCASE; the backend maps between them.
 */


/** Subscription lifecycle status. */
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

/**
 * Subscription STATUS — the Stripe side. What it costs is a separate call
 * (`GET /billing/bill`), because the two answer different questions and only
 * one of them changes when somebody switches a module on.
 *
 * The office/field/in-house seat split is gone: one flat seat, so there is
 * nothing to classify. `planTier` is gone with the tiers.
 */
export interface SubscriptionView {
  status: SubStatus;
  /** Active members — the only seat count there is now. */
  seats: number;
  /** What the bill last came to, monthly EUR cents. 0 = never billed. */
  totalCents: number | null;
  trialEndsAt: string | null; // ISO
  currentPeriodEnd: string | null; // ISO
  cancelAtPeriodEnd: boolean;
  /** True when write access is blocked (see isLocked). */
  locked: boolean;
  /**
   * Billed by agreement, outside Stripe. Nothing is charged automatically and
   * checkout is refused — the computed bill is an estimate for the contract
   * conversation, not something anybody is paying.
   */
  billedExternally: boolean;
  /** Convenience: days left in trial (null if not trialing). */
  trialDaysLeft: number | null;
}

/**
 * Client → server: start checkout.
 *
 * No tier — there is nothing to choose. The purchase is whatever the
 * organization already has switched on, computed server-side at checkout, so a
 * client cannot subscribe itself to a cheaper bill than the one it is using.
 *
 * No interval either — billing is monthly, full stop. The request carries
 * nothing at all, which is the point: there is no billing decision left to make.
 */
export type CheckoutRequest = Record<string, never>;

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
