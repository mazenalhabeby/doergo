import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { STRIPE_PRICE_ENV_KEYS, type StripeLine } from '@hbcfield/shared';
import type { PlanTier, BillingInterval, SeatType } from '@hbcfield/shared';

/**
 * What the Stripe services share: the lazily built client, whether Stripe is
 * configured, and price ids resolved by lookup key.
 */
@Injectable()
export abstract class StripeBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly config: ConfigService) {}

  protected client: Stripe | null = null;

  get isConfigured(): boolean {
    return !!this.config.get<string>('STRIPE_SECRET_KEY');
  }

  protected get stripe(): Stripe {
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
  protected readonly priceIdCache = new Map<string, string>();

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
  /**
   * One subscription item from a billing line.
   *
   * A line with `amountCents` is charged as that exact amount at quantity ONE,
   * through an ad-hoc price under the product its lookup key already names.
   * The alternative — a €0.01 price with the amount in the quantity — is
   * arithmetically identical and reads as "Qty 7700 @ €0.01 each" on the
   * customer's invoice, which is an implementation detail with no business
   * meaning.
   *
   * The PRODUCT is stable, so a subscription still diffs cleanly: the item is
   * matched by product rather than by price id, and only the price changes when
   * the amount does.
   */
  protected async lineToItem(
    line: StripeLine,
    priceId: string,
  ): Promise<{
    price?: string;
    price_data?: Stripe.SubscriptionCreateParams.Item.PriceData;
    quantity: number;
    productId: string;
  }> {
    const price = await this.stripe.prices.retrieve(priceId);
    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    if (line.amountCents == null) {
      return { price: priceId, quantity: line.quantity, productId };
    }
    return {
      price_data: {
        currency: price.currency,
        product: productId,
        unit_amount: line.amountCents,
        recurring: { interval: 'month' },
      },
      quantity: 1,
      productId,
    };
  }
}
