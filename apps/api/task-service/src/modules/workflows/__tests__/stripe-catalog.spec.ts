import {
  stripeCatalog,
  stripeLinesForBill,
  stripeLookupKey,
  orgMonthlyCost,
  AVAILABLE_MODULES,
  AVAILABLE_ADD_ONS,
  MODULE_MONTHLY_CENTS,
  SEAT_MONTHLY_CENTS,
  OBSERVER_SEAT_MONTHLY_CENTS,
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
    expect(charged(stripeLinesForBill(b))).toBe(b.monthlyCents);
  });

  it('holds for an organization with nothing but seats', () => {
    const b = bill({ spaces: [], addOns: [] });
    expect(charged(stripeLinesForBill(b))).toBe(b.monthlyCents);
  });

  it('holds when an organization has observer seats too', () => {
    // Two prices for two kinds of person: the arithmetic on screen and the
    // arithmetic Stripe is sent must still land on the same cent.
    const b = bill({ observerSeatCount: 3 });
    expect(charged(stripeLinesForBill(b))).toBe(b.monthlyCents);
  });

  it('prices an observer at a fifth of a seat, not at a seat', () => {
    const withObservers = bill({ seatCount: 8, observerSeatCount: 2 });
    const allStaff = bill({ seatCount: 10, observerSeatCount: 0 });
    // Ten people either way — the two outsiders must cost less than staff.
    expect(withObservers.monthlyCents).toBeLessThan(allStaff.monthlyCents);
    expect(withObservers.observerSeatMonthlyCents).toBe(2 * OBSERVER_SEAT_MONTHLY_CENTS);
    expect(withObservers.seatMonthlyCents).toBe(8 * SEAT_MONTHLY_CENTS);
  });

  it('sends the observer seat as its OWN line, never folded into the seat count', () => {
    // An invoice reading "12 seats" when two of them cost two euros is a
    // support ticket, and it hides the discount the customer was given.
    const lines = stripeLinesForBill(bill({ seatCount: 8, observerSeatCount: 2 }));
    const seat = lines.find((l) => l.lookupKey === stripeLookupKey('seat', ''));
    const obs = lines.find((l) => l.lookupKey === stripeLookupKey('seat_observer', ''));
    expect(seat?.quantity).toBe(8);
    expect(obs?.quantity).toBe(2);
  });

  it('omits the observer line entirely when there are none', () => {
    const lines = stripeLinesForBill(bill({ observerSeatCount: 0 }));
    expect(lines.some((l) => l.lookupKey === stripeLookupKey('seat_observer', ''))).toBe(false);
  });

  it('keeps the staff seat on its frozen lookup key', () => {
    // Live subscriptions resolve by this exact string. Adding a second seat
    // price must not have moved it.
    expect(stripeLookupKey('seat', '')).toBe('hbcfield_seat_monthly');
    expect(stripeLookupKey('seat_observer', '')).toBe('hbcfield_seat_observer_monthly');
  });

  it('holds when every count sits inside its free allowance', () => {
    const b = bill({
      spaces: [{ spaceId: 'a', spaceName: 'A', enabledModules: ['crm', 'assets'], usage: { crm: 10, assets: 3 } }],
      addOns: [],
    });
    expect(b.usageMonthlyCents).toBe(0);
    expect(charged(stripeLinesForBill(b))).toBe(b.monthlyCents);
  });

  it('holds at a size where the ladders are doing real work', () => {
    const b = bill({
      spaces: [{ spaceId: 'a', spaceName: 'A', enabledModules: ['crm', 'assets'], usage: { crm: 4000, assets: 900 } }],
    });
    expect(b.usageMonthlyCents).toBeGreaterThan(10000);
    expect(charged(stripeLinesForBill(b))).toBe(b.monthlyCents);
  });

  it('bills a module once per space that switched it on', () => {
    const lines = stripeLinesForBill(bill());
    expect(lines.find(l => l.lookupKey === stripeLookupKey('module', 'tracking'))?.quantity).toBe(2);
    expect(lines.find(l => l.lookupKey === stripeLookupKey('module', 'crm'))?.quantity).toBe(1);
  });

  it('never sends a zero-quantity line', () => {
    // Stripe keeps a zero-quantity item on the subscription, and it shows on the
    // invoice as a line for something the customer switched off.
    const b = bill({ seatCount: 0, spaces: [], addOns: [] });
    expect(stripeLinesForBill(b)).toEqual([]);
    for (const l of stripeLinesForBill(bill())) expect(l.quantity).toBeGreaterThan(0);
  });

  it('charges exactly what the breakdown shows', () => {
    // The invariant the whole model rests on: what Stripe is told, priced from
    // the catalogue, equals the total the screen renders — to the cent.
    const b = bill();
    expect(charged(stripeLinesForBill(b))).toBe(b.monthlyCents);
  });

  it('has one price per line, and it is monthly', () => {
    // Annual is gone. A catalogue still emitting a yearly price would have the
    // sync create prices nothing can ever select — and the 31 live monthly
    // prices are resolved by the frozen `_monthly` suffix, so it has to stay.
    for (const e of stripeCatalog()) {
      expect(e.recurring).toBe('month');
      expect(e.lookupKey.endsWith('_monthly')).toBe(true);
    }
  });
});

describe('the Stripe catalogue', () => {
  it('covers every priced module, every add-on, the seat and every ladder', () => {
    const c = stripeCatalog();
    const keys = new Set(c.map(e => e.lookupKey));
    expect(keys.has('hbcfield_seat_monthly')).toBe(true);
    for (const m of AVAILABLE_MODULES) {
      if ((MODULE_MONTHLY_CENTS[m.key as string] ?? 0) <= 0) continue;
      expect(keys.has(stripeLookupKey('module', m.key as string))).toBe(true);
    }
    for (const a of AVAILABLE_ADD_ONS) {
      expect(keys.has(stripeLookupKey('addon', a.key))).toBe(true);
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
