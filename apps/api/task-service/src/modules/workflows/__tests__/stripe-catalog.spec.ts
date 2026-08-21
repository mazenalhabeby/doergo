import {
  stripeCatalog,
  stripeLinesForBill,
  stripeLookupKey,
  orgMonthlyCost,
  AVAILABLE_MODULES,
  AVAILABLE_ADD_ONS,
  MODULE_MONTHLY_CENTS,
  ANNUAL_MONTHS_CHARGED,
} from '@hbcfield/shared';

/** unit price of a lookup key, from the catalogue */
const priceOf = (lookupKey: string) =>
  stripeCatalog().find(e => e.lookupKey === lookupKey)?.unitAmountCents ?? 0;

/** what Stripe would actually charge for a set of lines */
const charged = (lines: ReturnType<typeof stripeLinesForBill>) =>
  lines.reduce((sum, l) => sum + priceOf(l.lookupKey) * l.quantity, 0);

describe('what Stripe is told', () => {
  /*
    THE invariant of this whole billing model.

    The tier model let the screen compute a price from a static table while
    Stripe was told something assembled separately, so the two could disagree
    and only an invoice would reveal it. These assert that the number a customer
    reads and the number Stripe charges come out of the same arithmetic — for
    ordinary bills, empty ones, and the awkward shapes in between.
  */
  const bill = (over: Partial<Parameters<typeof orgMonthlyCost>[0]> = {}) =>
    orgMonthlyCost({
      seatCount: 10,
      spaces: [
        { spaceId: 'a', spaceName: 'A', enabledModules: ['crm', 'assets', 'tracking'], usage: { crm: 200, assets: 60 } },
        { spaceId: 'b', spaceName: 'B', enabledModules: ['tracking'], usage: {} },
      ],
      addOns: ['invoicing', 'workflows'],
      ...over,
    });

  it('charges exactly what the breakdown says, to the cent', () => {
    const b = bill();
    expect(charged(stripeLinesForBill(b, 'monthly'))).toBe(b.monthlyCents);
  });

  it('holds for an organization with nothing but seats', () => {
    const b = bill({ spaces: [], addOns: [] });
    expect(charged(stripeLinesForBill(b, 'monthly'))).toBe(b.monthlyCents);
  });

  it('holds when every count sits inside its free allowance', () => {
    const b = bill({
      spaces: [{ spaceId: 'a', spaceName: 'A', enabledModules: ['crm', 'assets'], usage: { crm: 10, assets: 3 } }],
      addOns: [],
    });
    expect(b.usageMonthlyCents).toBe(0);
    expect(charged(stripeLinesForBill(b, 'monthly'))).toBe(b.monthlyCents);
  });

  it('holds at a size where the ladders are doing real work', () => {
    const b = bill({
      spaces: [{ spaceId: 'a', spaceName: 'A', enabledModules: ['crm', 'assets'], usage: { crm: 4000, assets: 900 } }],
    });
    expect(b.usageMonthlyCents).toBeGreaterThan(10000);
    expect(charged(stripeLinesForBill(b, 'monthly'))).toBe(b.monthlyCents);
  });

  it('bills a module once per space that switched it on', () => {
    const lines = stripeLinesForBill(bill(), 'monthly');
    expect(lines.find(l => l.lookupKey === stripeLookupKey('module', 'tracking', 'monthly'))?.quantity).toBe(2);
    expect(lines.find(l => l.lookupKey === stripeLookupKey('module', 'crm', 'monthly'))?.quantity).toBe(1);
  });

  it('never sends a zero-quantity line', () => {
    // Stripe keeps a zero-quantity item on the subscription, and it shows on the
    // invoice as a line for something the customer switched off.
    const b = bill({ seatCount: 0, spaces: [], addOns: [] });
    expect(stripeLinesForBill(b, 'monthly')).toEqual([]);
    for (const l of stripeLinesForBill(bill(), 'monthly')) expect(l.quantity).toBeGreaterThan(0);
  });

  it('gives two months free on annual, on every kind of line', () => {
    const b = bill();
    // The discount lives in the PRICE, never in the quantity — the annual and
    // monthly line-ups are identical but for which price they point at.
    const m = stripeLinesForBill(b, 'monthly');
    const a = stripeLinesForBill(b, 'annual');
    expect(a.map(l => l.quantity)).toEqual(m.map(l => l.quantity));
    expect(charged(a)).toBe(b.monthlyCents * ANNUAL_MONTHS_CHARGED);
    expect(charged(a)).toBe(b.annualCents);
  });
});

describe('the Stripe catalogue', () => {
  it('covers every priced module, every add-on, the seat and every ladder', () => {
    const c = stripeCatalog();
    const keys = new Set(c.map(e => e.lookupKey));
    expect(keys.has('hbcfield_seat_monthly')).toBe(true);
    for (const m of AVAILABLE_MODULES) {
      if ((MODULE_MONTHLY_CENTS[m.key as string] ?? 0) <= 0) continue;
      expect(keys.has(stripeLookupKey('module', m.key as string, 'monthly'))).toBe(true);
      expect(keys.has(stripeLookupKey('module', m.key as string, 'annual'))).toBe(true);
    }
    for (const a of AVAILABLE_ADD_ONS) {
      expect(keys.has(stripeLookupKey('addon', a.key, 'monthly'))).toBe(true);
    }
  });

  it('gives every entry a unique lookup key', () => {
    // Two prices sharing a key makes the sync ambiguous and the runtime
    // non-deterministic about which one it charges.
    const keys = stripeCatalog().map(e => e.lookupKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never creates a free price', () => {
    for (const e of stripeCatalog()) expect(e.unitAmountCents).toBeGreaterThan(0);
  });

  it('prefixes everything, because the Stripe account is shared', () => {
    for (const e of stripeCatalog()) expect(e.lookupKey.startsWith('hbcfield_')).toBe(true);
  });
});
