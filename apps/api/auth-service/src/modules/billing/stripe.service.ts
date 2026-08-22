import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { createHash } from 'node:crypto';
import { STRIPE_PRICE_ENV_KEYS, type StripeLine } from '@hbcfield/shared';
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

  // ── the module model: prices resolved by lookup key ─────────────────────────

  /**
   * Stripe Price IDs, keyed by the lookup key the catalogue derives.
   *
   * Cached for the life of the process. Prices are immutable in Stripe and the
   * catalogue is static, so a hit is permanently valid — and this is read on
   * every seat change, module toggle and add-on purchase, which would otherwise
   * be a round trip each.
   *
   * A MISS is never cached. A price created after boot must be findable without
   * a restart, and a negative cache would make the first sync after a deploy
   * fail forever.
   */
  private readonly priceIdCache = new Map<string, string>();

  /**
   * Resolve the Price IDs for a set of lines, in one request per page.
   *
   * Deliberately batch: a bill can have twenty lines, and `prices.retrieve` per
   * line turns saving one add-on into twenty round trips against Stripe's rate
   * limit.
   *
   * Throws on a lookup key Stripe does not have, naming it. That state means the
   * sync script has not been run for a module the code already prices — and the
   * honest failure is a loud error, not a subscription quietly missing a line
   * the customer is using.
   */
  async resolvePriceIds(lookupKeys: string[]): Promise<Map<string, string>> {
    const wanted = [...new Set(lookupKeys)];
    const missing = wanted.filter((k) => !this.priceIdCache.has(k));

    if (missing.length) {
      // Stripe caps lookup_keys at 10 per request.
      for (let i = 0; i < missing.length; i += 10) {
        const page = await this.stripe.prices.list({ lookup_keys: missing.slice(i, i + 10), active: true, limit: 100 });
        for (const price of page.data) {
          if (price.lookup_key) this.priceIdCache.set(price.lookup_key, price.id);
        }
      }
    }

    const out = new Map<string, string>();
    const unresolved: string[] = [];
    for (const key of wanted) {
      const id = this.priceIdCache.get(key);
      if (id) out.set(key, id);
      else unresolved.push(key);
    }
    if (unresolved.length) {
      throw new InternalServerErrorException(
        `No Stripe price for: ${unresolved.join(', ')}. Run tools/stripe/sync-modules.mjs --apply.`,
      );
    }
    return out;
  }

  /**
   * Make a subscription hold exactly these lines, prorated.
   *
   * "Exactly" is the important word: a line that is no longer in the bill is
   * DELETED, not left at its old quantity. A module switched off in the last
   * space that had it must stop being charged, and the failure mode of forgetting
   * is charging somebody for something they cannot see.
   *
   * Proration timing follows the rule the seat sync already used:
   *   • invoiceNow → `always_invoice`, charge now. For annual INCREASES, so a
   *     mid-term addition is not free until the yearly renewal.
   *   • otherwise → `create_prorations`, banked onto the next invoice. Monthly
   *     (the next invoice is soon) and annual DECREASES, so a credit accrues
   *     against the renewal instead of cutting an immediate credit note.
   *
   * The idempotency key is derived from the target line-up, so a retry of the
   * same change is free and a different change is not mistaken for one.
   */
  async setSubscriptionLines(
    subscriptionId: string,
    lines: StripeLine[],
    opts?: { invoiceNow?: boolean },
  ): Promise<Stripe.Subscription> {
    const priceIds = await this.resolvePriceIds(lines.map((l) => l.lookupKey));
    const wanted = new Map(lines.map((l) => [priceIds.get(l.lookupKey)!, l.quantity]));

    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const items: Stripe.SubscriptionUpdateParams.Item[] = [];

    // Update or delete what is already there.
    for (const item of sub.items.data) {
      const qty = wanted.get(item.price.id);
      if (qty == null) {
        items.push({ id: item.id, deleted: true });
      } else {
        if (item.quantity !== qty) items.push({ id: item.id, quantity: qty });
        wanted.delete(item.price.id);
      }
    }
    // Whatever is left is new.
    for (const [price, quantity] of wanted) items.push({ price, quantity });

    if (!items.length) return sub; // nothing moved — do not bill a no-op

    const fingerprint = lines
      .map((l) => `${l.lookupKey}:${l.quantity}`)
      .sort()
      .join('|');

    return this.stripe.subscriptions.update(
      subscriptionId,
      { items, proration_behavior: opts?.invoiceNow ? 'always_invoice' : 'create_prorations' },
      { idempotencyKey: `lines_${subscriptionId}_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}` },
    );
  }

  /** Checkout for the module model: one session carrying every line of the bill. */
  async createCheckoutSessionForLines(p: {
    customerId: string;
    lines: StripeLine[];
    successUrl: string;
    cancelUrl: string;
    trialDays?: number;
  }): Promise<Stripe.Checkout.Session> {
    const priceIds = await this.resolvePriceIds(p.lines.map((l) => l.lookupKey));
    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: p.customerId,
      line_items: p.lines.map((l) => ({ price: priceIds.get(l.lookupKey)!, quantity: l.quantity })),
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      allow_promotion_codes: true,
      tax_id_collection: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      automatic_tax: { enabled: this.config.get<string>('STRIPE_AUTOMATIC_TAX') === 'true' },
      ...(p.trialDays ? { subscription_data: { trial_period_days: p.trialDays } } : {}),
    });
  }

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
