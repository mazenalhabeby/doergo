import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { STRIPE_PRICE_ENV_KEYS } from '@hbcfield/shared';
import type { PlanTier, BillingInterval, SeatType } from '@hbcfield/shared';

/**
 * Thin wrapper around the Stripe SDK. The client is created lazily so the
 * auth-service still boots when Stripe keys are absent (billing simply reports
 * "not configured" until the keys are set) — every other feature keeps working.
 *
 * SECURITY: the secret key + webhook secret live only in env and never leave this
 * service; price IDs are resolved server-side from env, never trusted from clients.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('STRIPE_SECRET_KEY');
  }

  private get stripe(): Stripe {
    if (!this.client) {
      const key = this.config.get<string>('STRIPE_SECRET_KEY');
      if (!key) {
        throw new InternalServerErrorException('Stripe is not configured (STRIPE_SECRET_KEY missing)');
      }
      this.client = new Stripe(key, { typescript: true, maxNetworkRetries: 2 });
    }
    return this.client;
  }

  /** Resolve a Stripe Price ID from env for a billable line. Server-side only. */
  priceId(seat: SeatType, tier: PlanTier, interval: BillingInterval): string {
    let envKey: string | undefined;
    if (seat === 'field') {
      envKey = STRIPE_PRICE_ENV_KEYS.field[interval];
    } else if (seat === 'field_inhouse') {
      envKey = STRIPE_PRICE_ENV_KEYS.fieldInhouse[interval];
    } else if (tier === 'starter' || tier === 'professional' || tier === 'business') {
      envKey = STRIPE_PRICE_ENV_KEYS[tier].office[interval];
    }
    let id = envKey ? this.config.get<string>(envKey) : undefined;
    // Safety net: until a dedicated in-house Stripe price is configured, an
    // in-house field seat bills at the standard field price (no missing-env
    // error, no discount). Once STRIPE_PRICE_FIELD_INHOUSE_* is set it takes over.
    if (!id && seat === 'field_inhouse') {
      id = this.config.get<string>(STRIPE_PRICE_ENV_KEYS.field[interval]);
    }
    if (!id) {
      throw new InternalServerErrorException(
        `Missing Stripe price for ${seat}/${tier}/${interval} (env ${envKey ?? 'n/a'})`,
      );
    }
    return id;
  }

  // ── C3 pricing-sync primitives ──────────────────────────────────────────────
  /** Current unit amount (cents) + product of a live Stripe price (read-only). */
  async getPriceInfo(priceId: string): Promise<{ unitAmount: number | null; product: string; currency: string; active: boolean }> {
    const p = await this.stripe.prices.retrieve(priceId);
    return { unitAmount: p.unit_amount ?? null, product: typeof p.product === 'string' ? p.product : (p.product as any)?.id, currency: p.currency, active: p.active };
  }

  /** Create a NEW recurring price on a product (immutable). Does NOT change any
   * subscription — existing subs keep their old price (grandfathered). */
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

  /** Create a customer if we don't have one yet; returns the customer id. */
  async ensureCustomer(params: {
    customerId?: string | null;
    email?: string | null;
    name: string;
    orgId: string;
  }): Promise<string> {
    if (params.customerId) return params.customerId;
    const customer = await this.stripe.customers.create({
      email: params.email ?? undefined,
      name: params.name,
      metadata: { organizationId: params.orgId },
    });
    return customer.id;
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

  /** Stripe-hosted Customer Portal (manage payment method, invoices, cancel). */
  async createPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
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

  async cancelAtPeriodEnd(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  }

  /** Verify + parse a webhook using the raw body and signing secret. */
  constructEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new InternalServerErrorException('STRIPE_WEBHOOK_SECRET missing');
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }
}
