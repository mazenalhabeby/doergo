import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { StripeClientService } from './stripe-client.service';

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
  constructor(
    private readonly config: ConfigService,
    private readonly stripeClient: StripeClientService,
  ) {}

  get isConfigured(): boolean {
    return this.stripeClient.isConfigured;
  }

  private get stripe(): Stripe {
    return this.stripeClient.api;
  }

  /**
   * Move a live subscription between collection methods.
   *
   * Switching an existing customer rather than re-checking them out: the
   * subscription, its prices and its history stay put, which is what makes this
   * a billing decision rather than a migration.
   *
   * `days_until_due` must be SET when moving to send_invoice and CLEARED when
   * moving away — Stripe rejects the pair being inconsistent, and a stale term
   * left behind is the kind of thing only an angry customer discovers.
   */
  async setCollectionMethod(
    subscriptionId: string,
    method: 'charge_automatically' | 'send_invoice',
    invoiceDueDays = 14,
  ): Promise<void> {
    /*
      ⚠️ `days_until_due` is OMITTED when moving to charge_automatically, not
      set to null. Null is rejected — "Invalid integer" — and the comment that
      used to sit here claimed it had to be CLEARED, which is what sent a null.

      Stripe drops the term itself when the collection method stops being
      send_invoice; the field is only valid alongside it.
    */
    await this.stripe.subscriptions.update(subscriptionId, {
      collection_method: method,
      ...(method === 'send_invoice' ? { days_until_due: Math.max(1, invoiceDueDays) } : {}),
    });
  }

  /**
   * Can this customer actually be charged?
   *
   * Moving to card is accepted by Stripe whether or not one exists — and then
   * the next invoice fails and the organization lands in past_due, days later,
   * for a change an operator made on their behalf. Asked BEFORE the switch so
   * the refusal names the cause instead of a dunning email doing it.
   */
  async hasPaymentMethod(customerId: string): Promise<boolean> {
    const customer = await this.stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if ((customer as Stripe.DeletedCustomer).deleted) return false;
    const c = customer as Stripe.Customer;
    if (c.invoice_settings?.default_payment_method) return true;
    if (c.default_source) return true;
    const methods = await this.stripe.paymentMethods.list({ customer: customerId, limit: 1 });
    return methods.data.length > 0;
  }

  /** Create a customer if we don't have one yet; returns the customer id. */
  async ensureCustomer(params: {
    customerId?: string | null;
    email?: string | null;
    name: string;
    /**
     * Stripe Tax computes VAT from where the customer IS. Checkout collects it
     * on the card flow; the invoice flow never opens Checkout, so it has to
     * come from the organization's own record or automatic_tax fails with
     * "customer_tax_location_invalid".
     */
    address?: {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      postal_code?: string | null;
      country?: string | null;
    } | null;
    orgId: string;
  }): Promise<string> {
    const hasCountry = !!params.address?.country;
    const address = hasCountry
      ? {
          line1: params.address?.line1 ?? undefined,
          line2: params.address?.line2 ?? undefined,
          city: params.address?.city ?? undefined,
          postal_code: params.address?.postal_code ?? undefined,
          country: params.address?.country ?? undefined,
        }
      : undefined;

    if (params.customerId) {
      /*
        An existing customer was returned untouched, so it kept whatever it was
        created with — and a customer created before addresses were sent has
        none, permanently. Stripe Tax then refuses with "The customer's location
        isn't recognized", and filling the address in on the organization
        changed nothing, because nothing ever wrote it across.

        Only when the address would actually change: a needless write on every
        checkout is an API call and an event for nothing.
      */
      if (address) {
        try {
          const existing = await this.stripe.customers.retrieve(params.customerId);
          const current = (existing as Stripe.Customer).address ?? null;
          const differs =
            current?.country !== address.country ||
            current?.postal_code !== address.postal_code ||
            current?.city !== address.city ||
            current?.line1 !== address.line1;
          if (differs) {
            await this.stripe.customers.update(params.customerId, { address });
          }
        } catch {
          // A customer that cannot be read or updated must not stop billing —
          // the create path below is not an option for an id that exists, and
          // Stripe will say so plainly if the address is genuinely required.
        }
      }
      return params.customerId;
    }

    const customer = await this.stripe.customers.create({
      email: params.email ?? undefined,
      name: params.name,
      // Only when there is a country: a partial address without one tells
      // Stripe Tax nothing and reads as a filled-in field that is not.
      ...(address ? { address } : {}),
      metadata: { organizationId: params.orgId },
    });
    return customer.id;
  }

  /** Stripe-hosted Customer Portal (manage payment method, invoices, cancel). */
  async createPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
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
