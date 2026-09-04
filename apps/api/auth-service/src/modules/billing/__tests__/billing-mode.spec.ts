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
