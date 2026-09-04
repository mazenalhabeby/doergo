import fs from 'fs';
import path from 'path';
import { orgMonthlyCost, SEAT_MONTHLY_CENTS, OBSERVER_SEAT_MONTHLY_CENTS } from '@hbcfield/shared/client';

/**
 * The billing page must add up on screen.
 *
 * Every figure it renders comes from one breakdown, so the danger is not a
 * wrong number — it is a page that shows four parts which do not reconstruct
 * the total it prints above them. That is the shape of a billing screen people
 * write in about, and it is invisible until somebody with an unusual
 * organization opens it.
 */
const bill = (over = {}) =>
  orgMonthlyCost({
    seatCount: 13,
    externalSeatCount: 1,
    observerSeatCount: 1,
    spaces: [
      { spaceId: 'a', spaceName: 'A', enabledModules: ['crm', 'assets', 'tracking'], usage: { crm: 200, assets: 60 } },
      { spaceId: 'b', spaceName: 'B', enabledModules: [], usage: {} },
    ],
    addOns: ['invoicing', 'workflows'],
    ...over,
  });

describe('what the page renders reconstructs the total', () => {
  it('the four tiles and the two remaining parts sum to the printed total', () => {
    const b = bill();
    const staff = b.staffSeatCount * SEAT_MONTHLY_CENTS;
    const external = b.externalSeatCount * SEAT_MONTHLY_CENTS;
    const observers = b.observerSeatCount * OBSERVER_SEAT_MONTHLY_CENTS;
    const spaces = b.spacesMonthlyCents + b.usageMonthlyCents;
    expect(staff + external + observers + spaces + b.addOnsMonthlyCents).toBe(b.monthlyCents);
  });

  it('the legend’s three bands sum to the total', () => {
    // People / Workspaces / Options — the bar has no fourth colour, so these
    // three must account for every cent or a band is missing.
    const b = bill();
    const people = b.seatMonthlyCents + b.observerSeatMonthlyCents;
    const spaces = b.spacesMonthlyCents + b.usageMonthlyCents;
    expect(people + spaces + b.addOnsMonthlyCents).toBe(b.monthlyCents);
  });

  it('the seat tiles reconstruct the seat line Stripe is sent', () => {
    // staff + external are ONE quantity on the subscription; the split is
    // display only and must never invent or lose a seat.
    const b = bill();
    expect(b.staffSeatCount + b.externalSeatCount).toBe(b.seatCount);
    expect(b.staffSeatCount * SEAT_MONTHLY_CENTS + b.externalSeatCount * SEAT_MONTHLY_CENTS).toBe(b.seatMonthlyCents);
  });

  it('survives an organization with nothing at all', () => {
    // The bar divides by the total. A brand-new org would render NaN% widths.
    const b = orgMonthlyCost({ seatCount: 0, spaces: [], addOns: [] });
    expect(b.monthlyCents).toBe(0);
    expect(b.staffSeatCount).toBe(0);
    expect(b.observerSeatCount).toBe(0);
  });
});

describe('the page tells people the price excludes tax', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/settings/billing/_components/bill-breakdown.tsx'),
    'utf8',
  );

  it('says so beside the total, not at checkout', () => {
    /*
      Every price is stored in Stripe with `tax_behavior: exclusive` — VAT is
      added ON TOP of these figures. A customer who reads the total and is
      charged 20% more has been surprised by us, at the worst moment.
    */
    expect(src).toContain("billing.bill.exVat");
  });

  it('does not name a rate', () => {
    // The rate depends on the customer's country and whether they gave a VAT
    // number; Stripe decides it at checkout. Printing "20%" would be wrong for
    // every cross-border B2B customer, who are reverse-charged to zero.
    expect(src).not.toMatch(/\b20\s*%/);
  });
});

describe('the options rail', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/settings/billing/_components/options-rail.tsx'),
    'utf8',
  );

  it('refuses to edit for a non-admin, in both controls', () => {
    // The server enforces ADMIN on PUT /billing/add-ons; this is the second
    // layer, and it must cover the button AND the picker it opens.
    expect(src).toContain('disabled={!isAdmin}');
    expect(src).toContain('disabled={!isAdmin || portalBusy}');
  });

  it('mounts the picker only while the dialog is open', () => {
    // Twelve switches and their translated descriptions are not built on every
    // visit to a page that is read far more often than it is edited.
    expect(src).toMatch(/<Dialog open=\{open\}/);
  });
});

describe('an organization with no subscription can start one', () => {
  const rail = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/settings/billing/_components/options-rail.tsx'),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/settings/billing/page.tsx'),
    'utf8',
  );

  it('offers checkout, which nothing in the product used to call', () => {
    /*
      `POST /billing/checkout` existed on the server and `billingApi.checkout()`
      in the client, and no screen ever invoked either. An organization on a
      card plan could not begin paying — which is why no real card payment had
      ever completed, and why the Portal button could only ever answer "No
      billing account yet".
    */
    expect(page).toContain('billingApi.checkout()');
    expect(rail).toContain('canSubscribe');
  });

  it('asks Stripe, not the amount, whether a billing account exists', () => {
    /*
      `totalCents` is NOT the signal. The subscription row is created when the
      trial starts with `lastBilledCents: 0`, so "0 = never billed" is a real
      value and `totalCents != null` answers true for an organization that has
      never had a Stripe account at all. Reading it that way is what put
      "Payment & invoices" in front of somebody and answered them "No billing
      account yet" — the one button that could not possibly work.
    */
    expect(page).toContain('!sub?.hasBillingAccount');
    expect(page).not.toContain('sub?.totalCents == null');
  });

  it('shows the Portal only when there is a subscription to manage', () => {
    /*
      The regression this replaces: `needsSubscription` answered BOTH "should we
      offer checkout?" and "is there something to manage?". Suppressing checkout
      during a trial therefore un-suppressed the Portal, and a trialing account
      with no Stripe customer was handed a button that could only answer "No
      billing account yet".
    */
    expect(rail).toContain('showPortal && hasSubscription');
    expect(page).toContain('hasSubscription={sub?.hasBillingAccount === true}');
  });

  it('does not ask for a card while the trial is running', () => {
    /*
      Nothing is owed yet, and asking mid-trial asks a question the customer
      has not reached — the trial exists so they can decide later. An operator
      ends the trial (admin.hbcfield.com → End trial) when the conversation
      about paying has actually begun, and the button appears then.
    */
    expect(page).toContain("sub?.status !== 'trialing'");
  });

  it('never offers it to a contract customer', () => {
    // EXTERNAL has nothing to check out and the server refuses it, so the
    // button must not appear and then fail.
    //
    // Asserted on the EXPRESSION, not its line breaks: the first version of
    // this matched a single formatted line and broke the moment the condition
    // grew a third clause, which is a test about whitespace pretending to be a
    // test about behaviour.
    const expr = page.slice(page.indexOf('canSubscribe={'), page.indexOf('canSubscribe={') + 240);
    expect(expr).toContain("!== 'EXTERNAL'");
  });
});
