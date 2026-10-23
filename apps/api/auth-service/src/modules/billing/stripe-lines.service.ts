import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { createHash } from 'node:crypto';
import { type StripeLine } from '@hbcfield/shared';
import { ConfigService } from '@nestjs/config';
import { StripeClientService } from './stripe-client.service';
import { StripePricesService } from './stripe-prices.service';

/**
 * A bill as Stripe subscription lines: syncing them, a checkout for them, an
 * invoice-mode subscription.
 */
@Injectable()
export class StripeLinesService {
  constructor(
    private readonly config: ConfigService,
    private readonly stripeClient: StripeClientService,
    private readonly prices: StripePricesService,
  ) {}

  get isConfigured(): boolean {
    return this.stripeClient.isConfigured;
  }

  private get stripe(): Stripe {
    return this.stripeClient.api;
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
    const priceIds = await this.prices.resolvePriceIds(lines.map((l) => l.lookupKey));

    /*
      Every line must resolve to a real price before ANY of them is applied.

      This was a non-null assertion. A key the account does not hold yet — a
      price added in code and not yet synced — resolved to undefined, went into
      the map as an undefined key, and was pushed as `{ price: undefined }`.
      Stripe then rejects the whole update, so the org's subscription stops
      tracking ANY change, including ordinary seat moves, and the error names
      neither the line nor the key.

      Refusing here fails in the same place but says what is missing, and it
      fails before the item list is half-built. The fix is always the same: run
      the catalogue sync.
    */
    const missing = lines.map((l) => l.lookupKey).filter((k) => !priceIds.get(k));
    if (missing.length) {
      throw new Error(
        `Stripe is missing ${missing.length} price(s): ${[...new Set(missing)].join(', ')}. ` +
          'Run the catalogue sync before this organization can be billed.',
      );
    }

    /*
      Matched by PRODUCT, not by price id.

      An aggregate line carries its exact amount and is sent as an ad-hoc price,
      so its price id changes whenever the amount does. Diffing on the price
      would therefore delete and re-add the line on every change — churn on the
      invoice, and a proration pair where one adjustment belongs.

      The product is stable, so "the Workspaces line" stays the same line while
      its amount moves.
    */
    const built = await Promise.all(lines.map((l) => this.prices.lineToItem(l, priceIds.get(l.lookupKey)!)));
    const wanted = new Map(built.map((b) => [b.productId, b]));

    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const items: Stripe.SubscriptionUpdateParams.Item[] = [];

    // Update or delete what is already there.
    for (const item of sub.items.data) {
      const productId = typeof item.price.product === 'string' ? item.price.product : item.price.product.id;
      const want = wanted.get(productId);
      if (!want) {
        items.push({ id: item.id, deleted: true });
        continue;
      }
      wanted.delete(productId);
      if (want.price_data) {
        // Only when the amount actually moved: re-pricing an unchanged line
        // would mint a price and a proration for nothing.
        if (item.price.unit_amount !== want.price_data.unit_amount || item.quantity !== 1) {
          items.push({ id: item.id, price_data: want.price_data, quantity: 1 });
        }
      } else if (item.price.id !== want.price) {
        items.push({ id: item.id, price: want.price, quantity: want.quantity });
      } else if (item.quantity !== want.quantity) {
        items.push({ id: item.id, quantity: want.quantity });
      }
    }
    // Whatever is left is new.
    for (const want of wanted.values()) {
      items.push(
        want.price_data
          ? { price_data: want.price_data, quantity: 1 }
          : { price: want.price!, quantity: want.quantity },
      );
    }

    if (!items.length) return sub; // nothing moved — do not bill a no-op

    const fingerprint = lines
      .map((l) => `${l.lookupKey}:${l.quantity}`)
      .sort()
      .join('|');

    return this.stripe.subscriptions.update(
      subscriptionId,
      { items, proration_behavior: opts?.invoiceNow ? 'always_invoice' : 'create_prorations' },
      {
        idempotencyKey: `lines_${subscriptionId}_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`,
      },
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
    const priceIds = await this.prices.resolvePriceIds(p.lines.map((l) => l.lookupKey));
    const missing = p.lines.map((l) => l.lookupKey).filter((k) => !priceIds.get(k));
    if (missing.length) {
      // Same refusal as setSubscriptionQuantities: never build a line list
      // around a price the account does not hold.
      throw new Error(
        `Stripe is missing ${missing.length} price(s): ${[...new Set(missing)].join(', ')}. ` +
          'Run the catalogue sync before this organization can be billed.',
      );
    }
    /*
      ⚠️ NO `collection_method` here. Stripe refuses it outright —
      "Received unknown parameter: subscription_data[collection_method]" — and
      passing it broke checkout for EVERY organization, card ones included,
      because charge_automatically was sent too.

      A Checkout Session always creates a charge_automatically subscription.
      INVOICE mode is applied to the subscription once it EXISTS, in
      `syncSubscription` off the webhook, using the same `setCollectionMethod`
      the operator console calls. One place decides the collection method, and
      it is the place that can actually set it.
    */
    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: p.customerId,
      line_items: await Promise.all(
        p.lines.map(async (l) => {
          const { productId: _p, ...i } = await this.prices.lineToItem(l, priceIds.get(l.lookupKey)!);
          return i as Stripe.Checkout.SessionCreateParams.LineItem;
        }),
      ),
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      allow_promotion_codes: true,
      tax_id_collection: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      automatic_tax: { enabled: this.config.get<string>('STRIPE_AUTOMATIC_TAX') === 'true' },
      ...(p.trialDays ? { subscription_data: { trial_period_days: p.trialDays } } : {}),
    });
  }

  /**
   * Start an INVOICE-mode subscription — no Checkout, and no card.
   *
   * Checkout in subscription mode always collects a payment method, which is
   * exactly wrong here: an invoice customer would hand over a card that is then
   * never charged, and the whole reason they are on invoice is that their
   * accounts department pays by transfer.
   *
   * So the subscription is created through the API, where `send_invoice` is
   * accepted, and Stripe issues and emails the first invoice itself.
   *
   * `days_until_due` is required by Stripe whenever the method is send_invoice.
   */
  async createInvoiceSubscription(p: {
    customerId: string;
    lines: StripeLine[];
    invoiceDueDays: number;
    trialDays?: number;
  }): Promise<Stripe.Subscription> {
    const priceIds = await this.prices.resolvePriceIds(p.lines.map((l) => l.lookupKey));
    const missing = p.lines.map((l) => l.lookupKey).filter((k) => !priceIds.get(k));
    if (missing.length) {
      throw new Error(
        `Stripe is missing ${missing.length} price(s): ${[...new Set(missing)].join(', ')}. ` +
          'Run the catalogue sync before this organization can be billed.',
      );
    }
    const items = await Promise.all(p.lines.map((l) => this.prices.lineToItem(l, priceIds.get(l.lookupKey)!)));
    return this.stripe.subscriptions.create({
      customer: p.customerId,
      items: items.map(({ productId: _p, ...i }) => i),
      collection_method: 'send_invoice',
      days_until_due: Math.max(1, p.invoiceDueDays),
      automatic_tax: { enabled: this.config.get<string>('STRIPE_AUTOMATIC_TAX') === 'true' },
      ...(p.trialDays ? { trial_period_days: p.trialDays } : {}),
    });
  }
}
