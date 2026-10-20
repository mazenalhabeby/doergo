import {
  applyAgreement,
  agreementFrom,
  agreementApplies,
  agreementEndsWithin,
  isMaterialAgreementDrift,
  validateAgreedPrice,
  stripeLinesForBill,
  stripeCatalog,
  stripeLookupKey,
  AGREED_PRICE_MAX_CENTS,
} from '@hbcfield/shared';

/*
  An agreed price replaces what an organization is charged. It is the one number
  in this system a person types straight onto a customer's invoice, so the tests
  below are about the two ways that goes wrong: charging them the deal AND the
  price list, and an alert that either never fires or fires every night.
*/

const bill = (over: Partial<any> = {}) => ({
  seatCount: 2,
  observerSeatCount: 0,
  seatMonthlyCents: 1998,
  observerSeatMonthlyCents: 0,
  staffSeatCount: 2,
  externalSeatCount: 0,
  spacesMonthlyCents: 54602,
  usageMonthlyCents: 0,
  addOnsMonthlyCents: 29700,
  monthlyCents: 86300,
  listMonthlyCents: 86300,
  spaces: [{ spaceId: 's1', spaceName: 'Field', cost: { lines: [{ moduleKey: 'crm', monthlyCents: 54602 }] } }],
  usage: [],
  addOns: [{ key: 'invoicing', monthlyCents: 29700 }],
  ...over,
});

const agreement = (over: Partial<any> = {}) => ({
  monthlyCents: 12000,
  listCentsAtAgreement: 86300,
  until: null,
  note: null,
  setAt: null,
  setById: null,
  ...over,
});

describe('applying an agreed price', () => {
  it('replaces the total and leaves every part alone', () => {
    // The parts are what the customer is GETTING. Deleting them to show one
    // number would make the billing page read as though the product shrank.
    const out = applyAgreement(bill(), agreement());

    expect(out.monthlyCents).toBe(12000);
    expect(out.listMonthlyCents).toBe(86300);
    expect(out.spacesMonthlyCents).toBe(54602);
    expect(out.addOnsMonthlyCents).toBe(29700);
  });

  it('does not mutate the bill it was given', () => {
    /*
      The same computed object goes to the Stripe layer and to the screen. A
      function that rewrote its argument would make the ORDER of those two calls
      decide what a customer is charged.
    */
    const original = bill();
    applyAgreement(original, agreement());
    expect(original.monthlyCents).toBe(86300);
    expect((original as any).agreement).toBeUndefined();
  });

  it('changes nothing when there is no agreement', () => {
    const out = applyAgreement(bill(), null);
    expect(out.monthlyCents).toBe(86300);
    expect((out as { agreement?: unknown }).agreement ?? null).toBeNull();
  });

  it('keeps honouring the price after the term has ended', () => {
    /*
      The single most consequential decision here. Reverting on the date would
      take a customer from €120 to €863 on one invoice because a timestamp
      passed — a support incident at best. Expiry raises an alert; a person
      decides.
    */
    const expired = agreement({ until: new Date(Date.now() - 90 * 86_400_000) });
    expect(agreementApplies(expired)).toBe(true);
    expect(applyAgreement(bill(), expired).monthlyCents).toBe(12000);
    // …and it is not silent about it.
    expect(agreementEndsWithin(expired)).toBe(true);
  });
});

describe('what Stripe is told', () => {
  it('charges the agreement INSTEAD of the price list, never as well', () => {
    // Emitting both would charge the sum of the two — the deal plus the thing
    // the deal replaced.
    const lines = stripeLinesForBill(applyAgreement(bill(), agreement()));

    expect(lines).toHaveLength(1);
    expect(lines[0].lookupKey).toBe(stripeLookupKey('agreed', ''));
    expect(lines[0].amountCents).toBe(12000);
    expect(lines[0].quantity).toBe(1);
  });

  it('still charges a deliberately free customer a line, at zero', () => {
    // A subscription with no items at all is refused by Stripe, and would make a
    // free customer indistinguishable from a broken sync.
    const lines = stripeLinesForBill(applyAgreement(bill(), agreement({ monthlyCents: 0 })));
    expect(lines).toHaveLength(1);
    expect(lines[0].amountCents).toBe(0);
  });

  it('charges the price list when there is no agreement', () => {
    const lines = stripeLinesForBill(bill());
    expect(lines.map((l) => l.lookupKey)).not.toContain(stripeLookupKey('agreed', ''));
    expect(lines.reduce((n, l) => n + (l.amountCents ?? 0), 0)).toBe(54602 + 29700);
  });

  it('has a product in the catalogue to bill it under', () => {
    // Without this the lookup key resolves to nothing and the reconcile throws
    // for exactly the customers who matter most.
    const entry = stripeCatalog().find((e) => e.kind === 'agreed');
    expect(entry).toBeDefined();
    expect(entry!.lookupKey).toBe('hbcfield_agreed_monthly');
  });

  it('bills the agreed price to the cent', () => {
    // The invariant the whole billing system rests on: what Stripe is told
    // equals what the screen shows.
    for (const cents of [1, 99, 12000, 86399, AGREED_PRICE_MAX_CENTS]) {
      const out = applyAgreement(bill(), agreement({ monthlyCents: cents }));
      const charged = stripeLinesForBill(out).reduce((n, l) => n + (l.amountCents ?? 0) * l.quantity, 0);
      expect(charged).toBe(out.monthlyCents);
    }
  });
});

describe('drift — has the customer outgrown the deal?', () => {
  it('does not fire on the deal itself', () => {
    /*
      €120 against €863 is not drift, it is the agreement. Measuring the agreed
      price against the list price would alert on the day it was set and every
      night after — the same as having no alert, but noisier.
    */
    expect(isMaterialAgreementDrift(86300, 86300)).toBe(false);
  });

  it('fires when the list price grows well past what was agreed against', () => {
    expect(isMaterialAgreementDrift(86300, 124000)).toBe(true);
  });

  it('ignores a small customer adding one seat', () => {
    expect(isMaterialAgreementDrift(8900, 9899)).toBe(false);
  });

  it('catches a large customer growing by a small percentage', () => {
    // €200 more at 4% — a percentage test alone would never see it.
    expect(isMaterialAgreementDrift(500_000, 525_000)).toBe(true);
  });

  it('says nothing when there is no baseline to compare against', () => {
    // An agreement written before this column existed, or restored from a
    // backup. Silence is right: a made-up baseline invents an alert.
    expect(isMaterialAgreementDrift(null, 999_999)).toBe(false);
    expect(isMaterialAgreementDrift(0, 999_999)).toBe(false);
  });
});

describe('reading and validating what an operator typed', () => {
  it('treats the amount as the only thing that makes an agreement exist', () => {
    // A row with a note but no amount would otherwise charge somebody nothing.
    expect(agreementFrom({ agreedNote: 'discussed with Anna' })).toBeNull();
    expect(agreementFrom({ agreedMonthlyCents: 12000 })?.monthlyCents).toBe(12000);
    expect(agreementFrom(null)).toBeNull();
  });

  it('refuses an amount that is a hundred times too large rather than clamping it', () => {
    /*
      Typing cents where euros were meant is the realistic operator error and it
      is silent — the invoice is simply a hundred times bigger and Stripe charges
      it. Clamping would store a different number than the one they just read
      back to the customer on the phone.
    */
    const r = validateAgreedPrice({ monthlyCents: AGREED_PRICE_MAX_CENTS + 1 });
    expect(r.ok).toBe(false);
  });

  it('refuses a negative price, a fractional cent and a term already past', () => {
    expect(validateAgreedPrice({ monthlyCents: -1 }).ok).toBe(false);
    expect(validateAgreedPrice({ monthlyCents: 120.5 }).ok).toBe(false);
    expect(validateAgreedPrice({ monthlyCents: 12000, until: '2020-01-01' }).ok).toBe(false);
  });

  it('accepts zero — some customers are free on purpose', () => {
    expect(validateAgreedPrice({ monthlyCents: 0 }).ok).toBe(true);
  });

  it('trims a note and caps its length', () => {
    const r = validateAgreedPrice({ monthlyCents: 12000, note: `  ${'x'.repeat(900)}  ` });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.note!.length).toBe(500);
  });
});

describe('the term ending', () => {
  const now = new Date('2026-09-05T00:00:00Z');

  it('warns a month out, and not two', () => {
    expect(agreementEndsWithin(agreement({ until: '2026-09-20' }), 30, now)).toBe(true);
    expect(agreementEndsWithin(agreement({ until: '2026-12-01' }), 30, now)).toBe(false);
  });

  it('says nothing about an open-ended agreement', () => {
    expect(agreementEndsWithin(agreement({ until: null }), 30, now)).toBe(false);
  });
});
