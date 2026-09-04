import {
  BILLING_MODES,
  billsThroughStripe,
  collectionMethodFor,
  modeRequiresBillingEmail,
  type BillingMode,
} from '@hbcfield/shared';

/**
 * How an organization pays us.
 *
 * The riskiest control in the product: moving an organization to AUTOMATIC
 * starts charging a real customer's card, and moving one away stops revenue
 * arriving. These pin the distinctions that decide which of those happens.
 */
describe('billing modes', () => {
  it('has exactly three, and they are the ones the migration created', () => {
    // The Postgres enum was created with these three names. A fourth added in
    // TypeScript alone would be written to a column that refuses it.
    expect([...BILLING_MODES]).toEqual(['AUTOMATIC', 'INVOICE', 'EXTERNAL']);
  });

  it('puts a subscription on Stripe for the two modes that collect money', () => {
    expect(billsThroughStripe('AUTOMATIC')).toBe(true);
    // INVOICE is a real Stripe subscription — same prices, same tax, same
    // webhook. Only the collection differs. Treating it like EXTERNAL would
    // stop it tracking seats and modules.
    expect(billsThroughStripe('INVOICE')).toBe(true);
    expect(billsThroughStripe('EXTERNAL')).toBe(false);
  });

  it('maps each mode to the collection method Stripe understands', () => {
    expect(collectionMethodFor('AUTOMATIC')).toBe('charge_automatically');
    expect(collectionMethodFor('INVOICE')).toBe('send_invoice');
    // Null, not a default: EXTERNAL must never reach a Stripe call at all, and
    // falling back to charge_automatically would bill a contract customer.
    expect(collectionMethodFor('EXTERNAL')).toBeNull();
  });

  it('requires somewhere to send an invoice before invoicing', () => {
    // Checked where the mode is SET. A missing address found at billing time is
    // an invoice nobody receives and a payment nobody makes, a month later.
    expect(modeRequiresBillingEmail('INVOICE')).toBe(true);
    expect(modeRequiresBillingEmail('AUTOMATIC')).toBe(false);
    expect(modeRequiresBillingEmail('EXTERNAL')).toBe(false);
  });

  it('every mode has an answer for every question — no silent default', () => {
    for (const m of BILLING_MODES as readonly BillingMode[]) {
      expect(typeof billsThroughStripe(m)).toBe('boolean');
      expect(typeof modeRequiresBillingEmail(m)).toBe('boolean');
      // collectionMethodFor is allowed to be null, but only for EXTERNAL.
      if (m !== 'EXTERNAL') expect(collectionMethodFor(m)).not.toBeNull();
    }
  });
});

/**
 * Where the collection method can and cannot be set.
 *
 * Checkout REFUSES it — verified against the live API:
 *   "Received unknown parameter: subscription_data[collection_method]"
 * Passing it broke checkout for every organization, card ones included, because
 * charge_automatically was sent too. A Checkout Session always produces a
 * charge_automatically subscription; INVOICE is applied afterwards, to a
 * subscription that exists.
 */
describe('the collection method is applied where it can be', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');

  it('is never sent to Checkout', () => {
    const stripe = read('../stripe.service.ts');
    const idx = stripe.indexOf('checkout.sessions.create');
    expect(idx).toBeGreaterThan(-1);
    // The Checkout call itself must not carry it.
    expect(stripe.slice(idx, idx + 900)).not.toContain('collection_method:');
  });

  it('is applied when the subscription arrives from the webhook', () => {
    const billing = read('../billing.service.ts');
    expect(billing).toContain('setCollectionMethod(sub.id, want');
    // Best-effort: a webhook whose work is recorded must not fail over this,
    // or Stripe retries an event that already succeeded.
    expect(billing).toContain('Could not set collection method');
  });

  it('never opens Checkout for an invoice customer', () => {
    /*
      Checkout in subscription mode ALWAYS collects a payment method. For a
      customer whose accounts department pays by transfer that is exactly
      wrong: they would hand over a card that is then never charged, and the
      reason they are on invoice is that they do not want to.

      The subscription is created through the API instead, where send_invoice
      is accepted and Stripe issues the first invoice itself.
    */
    const billing = read('../billing.service.ts');
    expect(billing).toContain("if (org.billingMode === 'INVOICE')");
    expect(billing).toContain('createInvoiceSubscription');
    const stripe = read('../stripe.service.ts');
    expect(stripe).toContain("collection_method: 'send_invoice'");
    // days_until_due is required by Stripe whenever the method is send_invoice.
    expect(stripe).toContain('days_until_due');
  });

  it('gives the customer an address, because tax needs one', () => {
    /*
      Checkout collects an address on the card flow; the invoice flow never
      opens Checkout, so without this `automatic_tax` fails with
      "customer_tax_location_invalid" — at the moment of billing, for the
      customer who least expects friction.
    */
    const stripe = read('../stripe.service.ts');
    expect(stripe).toContain('customer_tax_location_invalid');
    // Only when a country is known: a partial address without one tells Stripe
    // Tax nothing and reads as a filled-in field that is not.
    expect(stripe).toContain('hasCountry');
  });

  it('keeps an existing customer’s address in step', () => {
    /*
      `ensureCustomer` returned an existing id untouched, so a customer created
      before addresses were sent kept none — permanently. Stripe Tax then
      refused, and filling the address in on the organization changed nothing,
      because nothing ever wrote it across. Happened on the first real invoice
      attempt.
    */
    const stripe = read('../stripe.service.ts');
    expect(stripe).toContain('customers.update(params.customerId, { address })');
    // Only when it would actually change — a write on every checkout is an API
    // call and an event for nothing.
    expect(stripe).toContain('if (differs)');
  });

  it('refuses a missing country in our words, before Stripe’s', () => {
    // "The customer's location isn't recognized" is accurate and names neither
    // the organization nor the screen that fixes it.
    const billing = read('../billing.service.ts');
    expect(billing).toContain('if (!org.country)');
    expect(billing).toContain('Settings → General');
  });

  it('reports a Checkout rejection instead of a bare 500', () => {
    // The failure reached the customer as "Internal server error" with nothing
    // in any log; the cause had to be reproduced against the live API.
    const billing = read('../billing.service.ts');
    expect(billing).toContain('Stripe could not start checkout');
  });
});
