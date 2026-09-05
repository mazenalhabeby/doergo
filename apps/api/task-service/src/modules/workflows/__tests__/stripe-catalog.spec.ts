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
  lines.reduce(
    (sum, l) =>
      // An aggregate line carries its exact amount and is charged once; a seat
      // line is a real catalogue price times a real count.
      sum + (l.amountCents != null ? l.amountCents * l.quantity : priceOf(l.lookupKey) * l.quantity),
    0,
  );

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

  it('splits the seat row for the screen without changing what is charged', () => {
    /*
      An external SUPERVISOR costs the same €9.99 as staff, so they sit inside
      `seatCount` and Stripe is told one quantity. The screen shows the
      composition — otherwise "People: 11 × €9.99" hides that two of the eleven
      work for a client, which is the first thing anybody asks about a bill.

      The halves must always sum to the whole, or the page stops adding up.
    */
    const b = bill({ seatCount: 11, externalSeatCount: 2 });
    expect(b.staffSeatCount + b.externalSeatCount).toBe(b.seatCount);
    expect(b.seatMonthlyCents).toBe(11 * SEAT_MONTHLY_CENTS);
    // One seat line, quantity 11 — the split is display only.
    const lines = stripeLinesForBill(b);
    expect(lines.filter((l) => l.lookupKey === stripeLookupKey('seat', ''))).toHaveLength(1);
    expect(charged(lines)).toBe(b.monthlyCents);
  });

  it('never lets the split exceed the seats it describes', () => {
    // A caller passing nonsense must not produce a negative staff count that
    // renders as "-1 × €9.99".
    const b = bill({ seatCount: 3, externalSeatCount: 99 });
    expect(b.externalSeatCount).toBe(3);
    expect(b.staffSeatCount).toBe(0);
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

  it('never sends more lines than Stripe will take', () => {
    /*
      Stripe refuses more than 20 recurring prices on a Checkout Session —
      verified against the live API. Itemised per module and per option, an
      organization with TWO workspaces already produced 19; one more module
      anywhere and nobody could pay, with a Stripe error on the payment screen.

      A shape that fails as a customer grows is the worst direction for it to
      fail in, so the bill is now at most five lines whatever its size.
    */
    const huge = orgMonthlyCost({
      seatCount: 400,
      observerSeatCount: 40,
      spaces: Array.from({ length: 25 }, (_, i) => ({
        spaceId: `s${i}`,
        spaceName: `S${i}`,
        enabledModules: ['crm', 'assets', 'tracking', 'time_tracking', 'service_reports', 'b2c_portal'],
        usage: { crm: 900, assets: 400, b2c_portal: 6 },
      })),
      addOns: [...AVAILABLE_ADD_ONS.map((a) => a.key)],
    });
    const lines = stripeLinesForBill(huge);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines.length).toBeLessThan(20);
    // And it still adds up, at that size.
    expect(charged(lines)).toBe(huge.monthlyCents);
  });

  it('never puts an amount in a quantity', () => {
    /*
      "Workspaces — Qty 7700 @ €0.01 each" is arithmetically right and
      meaningless to the person paying it: nobody buys seven thousand of
      anything, and a customer should not multiply to check their own bill.

      An aggregate carries its amount and is charged ONCE. Seats keep a real
      count against a real price, because "2 × €9.99" is how seats are sold and
      is the one line where the multiplication means something.
    */
    const lines = stripeLinesForBill(bill());
    for (const l of lines) {
      if (l.amountCents != null) expect(l.quantity).toBe(1);
      else expect(l.lookupKey).toMatch(/seat/);
    }
  });

  it('stays inside Stripe’s per-item quantity limit at a realistic size', () => {
    /*
      The aggregate lines carry cents in the quantity, and a subscription item's
      quantity caps at 999,999 — so one line can express up to €9,999.99. Worth
      knowing rather than discovering: it is two orders of magnitude beyond the
      largest bill this product has produced, and it is a ceiling on ONE line,
      not on the account.
    */
    const huge = orgMonthlyCost({
      seatCount: 400,
      spaces: Array.from({ length: 25 }, (_, i) => ({
        spaceId: `s${i}`, spaceName: `S${i}`,
        enabledModules: ['crm', 'assets', 'tracking', 'time_tracking'], usage: {},
      })),
      addOns: [...AVAILABLE_ADD_ONS.map((a) => a.key)],
    });
    for (const l of stripeLinesForBill(huge)) expect(l.quantity).toBeLessThan(1_000_000);
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
  it('holds exactly the lines a bill can produce', () => {
    /*
      Five, not thirty-three. The per-module, per-option and per-usage prices
      were 31 of the old catalogue and are what put an organization at 19 of
      Stripe's 20-line ceiling.

      The fifth is the agreed price, which replaces all four of the others for a
      customer who is not on the price list.

      The itemisation is not lost — /settings/billing shows every workspace,
      every module and every option, reconciling to the cent, which is more
      detail than a Stripe invoice ever carried.
    */
    const keys = stripeCatalog().map((e) => e.lookupKey).sort();
    expect(keys).toEqual([
      'hbcfield_agreed_monthly',
      'hbcfield_options_monthly',
      'hbcfield_seat_monthly',
      'hbcfield_seat_observer_monthly',
      'hbcfield_workspaces_monthly',
    ]);
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
