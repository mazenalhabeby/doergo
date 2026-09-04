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
