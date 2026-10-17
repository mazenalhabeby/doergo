import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { STRIPE_PRICE_ENV_KEYS } from '@hbcfield/shared';
import type { PlanTier, BillingInterval } from '@hbcfield/shared';
import { StripeBase } from './stripe.base';

/**
 * The operator's price book and the legacy tier subscription: products, prices,
 * tier checkout and quantities.
 */
@Injectable()
export class StripeCatalogService extends StripeBase {
  // ── C3 pricing-sync primitives ──────────────────────────────────────────────
  /** Current unit amount (cents) + product of a live Stripe price (read-only). */
  async getPriceInfo(priceId: string): Promise<{ unitAmount: number | null; product: string; currency: string; active: boolean }> {
    const p = await this.stripe.prices.retrieve(priceId);
    return { unitAmount: p.unit_amount ?? null, product: typeof p.product === 'string' ? p.product : (p.product as any)?.id, currency: p.currency, active: p.active };
  }

  /** Create a NEW recurring price on a product (immutable). Does NOT change any
   * subscription — existing subs keep their old price (grandfathered). */
  /**
   * Every active price on the account, paged.
   *
   * Auto-pagination rather than a fixed `limit`: the account is shared with
   * another product, so "our" prices are not guaranteed to be in the first
   * page of anybody's listing.
   */
  listActivePrices() {
    return this.stripe.prices.list({ limit: 100, active: true });
  }

  async createRecurringPrice(params: { product: string; unitAmount: number; interval: 'month' | 'year'; currency?: string }): Promise<string> {
    const price = await this.stripe.prices.create({
      product: params.product,
      unit_amount: params.unitAmount,
      currency: params.currency ?? 'eur',
      recurring: { interval: params.interval },
      tax_behavior: 'exclusive',
    });
    return price.id;
  }

  /** Point a product's default price at a new price → affects NEW checkouts only. */
  async setProductDefaultPrice(product: string, priceId: string): Promise<void> {
    await this.stripe.products.update(product, { default_price: priceId });
  }

  /** Create a product (for a NEW paid module add-on). */
  async createProduct(name: string): Promise<string> {
    const p = await this.stripe.products.create({ name, tax_code: 'txcd_10103001' });
    return p.id;
  }

  /** Hosted Checkout for a self-serve tier (office + optional field line items). */
  async createCheckoutSession(p: {
    customerId: string;
    tier: PlanTier;
    interval: BillingInterval;
    officeSeats: number;
    fieldSeats: number;
    fieldInhouseSeats: number;
    successUrl: string;
    cancelUrl: string;
    trialEnd?: number | null;
  }): Promise<Stripe.Checkout.Session> {
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: this.priceId('office', p.tier, p.interval), quantity: Math.max(1, p.officeSeats) },
    ];
    if (p.fieldSeats > 0) {
      line_items.push({ price: this.priceId('field', p.tier, p.interval), quantity: p.fieldSeats });
    }
    if (p.fieldInhouseSeats > 0) {
      line_items.push({ price: this.priceId('field_inhouse', p.tier, p.interval), quantity: p.fieldInhouseSeats });
    }
    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: p.customerId,
      line_items,
      subscription_data: p.trialEnd ? { trial_end: p.trialEnd } : undefined,
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      allow_promotion_codes: true,
      // Off by default so checkout works without Stripe Tax configured. Set
      // STRIPE_AUTOMATIC_TAX=true (once Stripe Tax is active) to collect tax —
      // no code change / redeploy of logic needed.
      automatic_tax: { enabled: this.config.get<string>('STRIPE_AUTOMATIC_TAX') === 'true' },
      // Ask for a business VAT ID (UID) at checkout. Cross-border EU B2B with a
      // valid ID gets reverse-charged (0% VAT); domestic (AT) stays 20%.
      tax_id_collection: { enabled: true },
      // We pass an existing customer, so persist the billing address + name that
      // Checkout collects back onto the customer — required for automatic_tax to
      // resolve the rate and for the reverse charge to apply.
      customer_update: { address: 'auto', name: 'auto' },
      client_reference_id: p.customerId,
    });
  }

  /**
   * Reverse-resolve the PURCHASED office tier + interval from a subscription's
   * line-item price IDs. This is the authoritative source of what the customer
   * actually pays for — used on every webhook so entitlement can never drift from
   * payment (e.g. a Starter buyer must not inherit the trial's Professional tier).
   * Returns null if no known office price matches (e.g. Enterprise/custom).
   */
  resolveTierInterval(sub: Stripe.Subscription): { tier: PlanTier; interval: BillingInterval } | null {
    const priceIds = new Set(sub.items.data.map((i) => i.price.id));
    const tiers: Array<'starter' | 'professional' | 'business'> = ['starter', 'professional', 'business'];
    const intervals: BillingInterval[] = ['monthly', 'annual'];
    for (const tier of tiers) {
      for (const interval of intervals) {
        const id = this.config.get<string>(STRIPE_PRICE_ENV_KEYS[tier].office[interval]);
        if (id && priceIds.has(id)) return { tier, interval };
      }
    }
    return null;
  }

  /**
   * Set the office/field line quantities on an existing subscription, prorated.
   *
   * Proration timing (decided by the caller via `invoiceNow`):
   *   • invoiceNow=true  → `always_invoice`: charge the prorated amount NOW. Used
   *     for annual INCREASES so a mid-term seat isn't free until the yearly renewal.
   *   • invoiceNow=false → `create_prorations`: bank the proration and apply it on
   *     the next invoice/renewal. Used for monthly (next invoice is soon) AND for
   *     annual DECREASES, so a removed seat's credit accrues cleanly to the account
   *     and reduces the renewal instead of cutting an immediate credit note.
   *
   * Either way Stripe computes the exact prorated amount; a decrease always yields
   * a credit (never a card refund), applied against future invoices.
   *
   * Idempotency key derived from the target quantities so retries are safe.
   */
  async setSubscriptionQuantities(
    subscriptionId: string,
    lines: {
      officePriceId: string;
      officeQty: number;
      fieldPriceId: string;
      fieldQty: number;
      fieldInhousePriceId: string;
      fieldInhouseQty: number;
    },
    opts?: { invoiceNow?: boolean },
  ): Promise<Stripe.Subscription> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const items: Stripe.SubscriptionUpdateParams.Item[] = [];
    const findItem = (priceId: string) => sub.items.data.find((i) => i.price.id === priceId);

    const office = findItem(lines.officePriceId);
    items.push(office ? { id: office.id, quantity: Math.max(1, lines.officeQty) } : { price: lines.officePriceId, quantity: Math.max(1, lines.officeQty) });

    // A field line is added/updated when its quantity is > 0, or deleted when it
    // drops to 0 (so a fully-external or fully-in-house org has no stray line).
    const syncField = (priceId: string, qty: number) => {
      const existing = findItem(priceId);
      if (qty > 0) {
        items.push(existing ? { id: existing.id, quantity: qty } : { price: priceId, quantity: qty });
      } else if (existing) {
        items.push({ id: existing.id, deleted: true });
      }
    };
    syncField(lines.fieldPriceId, lines.fieldQty);
    syncField(lines.fieldInhousePriceId, lines.fieldInhouseQty);

    const proration_behavior: Stripe.SubscriptionUpdateParams.ProrationBehavior =
      opts?.invoiceNow ? 'always_invoice' : 'create_prorations';

    return this.stripe.subscriptions.update(
      subscriptionId,
      { items, proration_behavior },
      { idempotencyKey: `seats_${subscriptionId}_${lines.officeQty}_${lines.fieldQty}_${lines.fieldInhouseQty}` },
    );
  }
}
