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
  /** How this organization pays — card, invoice, or by agreement. */
  billingMode: BillingMode;
  /** Payment terms in INVOICE mode. Meaningless in the others. */
  invoiceDueDays: number;
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

/**
 * How an organization pays us.
 *
 * `billedExternally` was a boolean, so it could only say "charge the card" or
 * "charge nothing at all". The case in between — a contract customer who still
 * wants a proper, numbered, VAT-correct invoice — had no way to be expressed,
 * and the workaround was to bill them nothing and send something by hand.
 *
 * INVOICE is not a second invoicing system. It is Stripe's own
 * `collection_method: 'send_invoice'`: same subscription, same prices, same
 * tax, same webhook. Only the collection differs, so nothing about the bill is
 * hand-built and nothing can drift from what the screen shows.
 */
export const BILLING_MODES = ['AUTOMATIC', 'INVOICE', 'EXTERNAL'] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

/** Does this mode put a subscription on Stripe at all? */
export function billsThroughStripe(mode: BillingMode): boolean {
  return mode === 'AUTOMATIC' || mode === 'INVOICE';
}

/** Stripe's collection method for a mode. Null when Stripe is not involved. */
export function collectionMethodFor(mode: BillingMode): 'charge_automatically' | 'send_invoice' | null {
  if (mode === 'AUTOMATIC') return 'charge_automatically';
  if (mode === 'INVOICE') return 'send_invoice';
  return null;
}

/**
 * An organization must have somewhere to send an invoice before it can be put
 * into INVOICE mode.
 *
 * Checked where the mode is SET rather than where the invoice is sent: a
 * missing address discovered at billing time is an invoice nobody receives and
 * a payment nobody makes, found a month later.
 */
export function modeRequiresBillingEmail(mode: BillingMode): boolean {
  return mode === 'INVOICE';
}

/**
 * Is this fall in a bill worth telling somebody about?
 *
 * Two tests, joined by OR, because one threshold cannot cover both ends of the
 * book:
 *
 *   • a PROPORTION catches the small customer — €90 → €60 is a third of their
 *     bill and obviously worth a look, but no absolute threshold would flag it
 *     without also flagging every ordinary seat removal;
 *   • an ABSOLUTE amount catches the large one — €500 off a €10,000 bill is 5%,
 *     which no percentage rule would notice, and it is the single most valuable
 *     thing on the list.
 *
 * Both are floored by a minimum, so removing one seat never raises an alert.
 * Someone leaving is normal; an organization dismantling itself is not, and an
 * alert that fires on the first is ignored by the time the second happens.
 */
export const BILLING_ALERT_MIN_DROP_CENTS = 2000; // €20 — below this it is noise
export const BILLING_ALERT_PROPORTION = 0.2; // a fifth of the bill
export const BILLING_ALERT_ABSOLUTE_CENTS = 10_000; // €100, whatever the share

export function isMaterialDrop(fromCents: number, toCents: number): boolean {
  // Nothing to compare against: a first bill is not a fall.
  if (fromCents <= 0) return false;
  const drop = fromCents - toCents;
  if (drop < BILLING_ALERT_MIN_DROP_CENTS) return false;
  return drop / fromCents >= BILLING_ALERT_PROPORTION || drop >= BILLING_ALERT_ABSOLUTE_CENTS;
}
