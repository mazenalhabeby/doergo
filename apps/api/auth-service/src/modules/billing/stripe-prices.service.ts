import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type Stripe from 'stripe';
import { type StripeLine } from '@hbcfield/shared';
import { StripeClientService } from './stripe-client.service';

/**
 * The module model's prices: Price IDs resolved by lookup key (cached for the
 * life of the process — the one cache), and a billing line as a subscription item.
 */
@Injectable()
export class StripePricesService {
  constructor(private readonly stripeClient: StripeClientService) {}

  private get stripe(): Stripe {
    return this.stripeClient.api;
  }

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
  async lineToItem(
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
