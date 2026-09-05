/**
 * What must exist in Stripe for this pricing model, derived from the price list.
 *
 * The tier model kept its Stripe Price IDs in eight environment variables. That
 * does not survive contact with this model: sixteen modules, eleven add-ons, a
 * seat and three usage lines is thirty-one IDs. Thirty-one environment variables
 * is not configuration, it is a second copy of the price list that drifts from
 * the first.
 *
 * So nothing is configured. Every price carries a deterministic Stripe
 * `lookup_key` derived from the thing it prices, and both the sync script and
 * the runtime compute the same key from the same table:
 *
 *     hbcfield_module_crm_monthly
 *     hbcfield_addon_invoicing_monthly
 *     hbcfield_seat_monthly
 *     hbcfield_usage_assets_monthly
 *
 * Consequences worth having:
 *   • Adding a module to AVAILABLE_MODULES adds its Stripe objects on the next
 *     sync. Nobody has to remember to add an env var, and nobody can add one
 *     with the wrong ID.
 *   • The sync is idempotent by construction: a lookup key either exists or it
 *     does not, so re-running creates nothing and repairs anything missing.
 *   • A price that disagrees with this file is DETECTABLE — the sync reports it
 *     rather than silently charging the old number, which is the failure that
 *     matters most on a live account.
 *
 * HOW USAGE IS BILLED. The ladders are graduated PER SPACE, and Stripe's own
 * tiered pricing would ladder over one quantity for the whole subscription —
 * a different, cheaper number. Stripe also refuses two subscription items with
 * the same price, so one item per space is not available either. So a counted
 * module gets a unit price of ONE CENT and a quantity of the cents its ladder
 * came to. The arithmetic stays here, where it is tested, and the invoice reads
 * "Assets — usage ×4,800 = €48.00" rather than an opaque total.
 */

import { SEAT_MONTHLY_CENTS, OBSERVER_SEAT_MONTHLY_CENTS } from './module-pricing';

/** Every price this system creates is prefixed, so a shared Stripe account stays legible. */
export const STRIPE_LOOKUP_PREFIX = 'hbcfield';

export type StripeLineKind =
  | 'seat'
  | 'seat_observer'
  /** Everything the workspaces cost, as one line. See stripeLinesForBill. */
  | 'workspaces'
  /** Everything bought once for the organization, as one line. */
  | 'options'
  /**
   * A price agreed with this customer, replacing everything above.
   *
   * Its own product so the invoice says what it is. A customer paying an agreed
   * rate who receives an invoice itemised "Workspaces €546.02, Options €297.00"
   * totalling €120 has been sent a document that does not add up, and they will
   * ask — reasonably — which number is real.
   */
  | 'agreed';

/**
 * The stable lookup key for one billable line. Same function, script and runtime.
 *
 * The `_monthly` suffix is a FROZEN LITERAL, not a variable, and must stay one.
 * Thirty-one live prices on the Stripe account are already resolved by these
 * exact strings; shortening the key to drop a word would leave every one of them
 * unfindable and have the sync mint a second, duplicate price list. It reads as
 * redundant now that monthly is the only interval — that is the cost of keeping
 * a customer's subscription resolvable, and it is the cheaper side of the trade.
 */
export function stripeLookupKey(kind: StripeLineKind, _key = ''): string {
  /*
    Four keys, one per line the bill can produce. `_key` survives as a parameter
    only so the hundred call sites reading `stripeLookupKey('seat', '')` keep
    compiling; nothing uses it, because there is no longer a price per module or
    per option to distinguish.

    The staff seat's key stays the frozen literal — it must keep resolving to the
    price a live subscription would reference.
  */
  if (kind === 'seat') return `${STRIPE_LOOKUP_PREFIX}_seat_monthly`;
  if (kind === 'seat_observer') return `${STRIPE_LOOKUP_PREFIX}_seat_observer_monthly`;
  return `${STRIPE_LOOKUP_PREFIX}_${kind}_monthly`;
}

/** One product/price pair the account is expected to hold. */
export interface StripeCatalogEntry {
  kind: StripeLineKind;
  /** Module key, add-on key, or '' for the seat. */
  key: string;
  lookupKey: string;
  /** Shown on the invoice and in the Stripe dashboard. */
  productName: string;
  /** Unit amount in EUR cents. For `usage` this is 1 — the quantity carries the total. */
  unitAmountCents: number;
  /** Stripe recurring interval. Always monthly — there is no other. */
  recurring: 'month';
}

/**
 * Everything that should exist in Stripe, computed from the price list.
 *
 * Deliberately a function rather than a constant: it reads the live tables, so a
 * price change here can never leave a stale catalogue behind for the sync to
 * compare against.
 */
export function stripeCatalog(): StripeCatalogEntry[] {
  const out: StripeCatalogEntry[] = [];

  const push = (kind: StripeLineKind, key: string, name: string, monthlyCents: number) => {
    out.push({
      kind,
      key,
      lookupKey: stripeLookupKey(kind, key),
      productName: name,
      unitAmountCents: monthlyCents,
      recurring: 'month',
    });
  };

  push('seat', '', 'HBCField — User seat', SEAT_MONTHLY_CENTS);
  push('seat_observer', '', 'HBCField — External observer seat', OBSERVER_SEAT_MONTHLY_CENTS);
  /*
    Two aggregate lines at ONE CENT each, carrying their amount in the quantity.

    Stripe refuses more than 20 recurring prices on a Checkout Session, and an
    itemised bill reached 19 for an organization with two workspaces — one more
    module switched on anywhere and nobody could pay at all, with a Stripe error
    on the payment screen. Itemising per module and per option is a shape that
    fails as a customer grows, which is the worst possible direction for it to
    fail in.

    So the bill is FIVE lines at most, whatever its size: staff seats, observer
    seats, everything the workspaces cost, everything bought once, and nothing
    else. The cent-priced aggregate is the pattern the usage ladders already
    used — it is not a new idea here, only applied one level up.

    What is lost is the per-module breakdown ON THE STRIPE INVOICE. It is not
    lost to the customer: /settings/billing itemises every workspace, every
    module and every option, and the totals reconcile to the cent — which is
    more detail than the invoice ever carried.
  */
  push('workspaces', '', 'HBCField — Workspaces (modules & usage)', 1);
  push('options', '', 'HBCField — Options', 1);
  /*
    The agreed price. One cent here too, for the same reason the aggregates are:
    the price object exists to NAME A PRODUCT, and the real amount rides on the
    line (see StripeLine.amountCents). Nothing is ever charged at a cent.
  */
  push('agreed', '', 'HBCField — Agreed monthly price', 1);

  /*
    No per-module, per-option or per-usage prices any more.

    They were 31 of the 33, and they are what put an organization at 19 of
    Stripe's 20-line ceiling. The two aggregate prices above carry the same
    money in their quantity, and the itemisation lives in the product, where it
    is richer and where people actually look at it.

    The prices already on the account are left alone — the sync never archives
    unless asked, and a price nothing references costs nothing. They are also
    the way back if this is ever reversed.
  */
  return out;
}

/** One line of a subscription: which price, and how many. */
export interface StripeLine {
  lookupKey: string;
  quantity: number;
  /** For logs and for the dry-run report — never sent to Stripe. */
  describe: string;
  /**
   * An exact amount for this line, in cents, charged ONCE per month.
   *
   * Set only on the aggregate lines. They used a €0.01 price with the amount in
   * the quantity, which is arithmetically right and unreadable on an invoice:
   * "Workspaces — Qty 7700 @ €0.01 each". Nobody buys seven thousand of
   * anything, and a customer should not have to multiply to check their own
   * bill.
   *
   * When present, the Stripe layer builds the line from the amount at quantity
   * ONE, under the product the lookup key already names — so the invoice reads
   * "Workspaces €77.00" and the subscription still diffs by product.
   *
   * Seats keep a real catalogue price: "2 × €9.99" is how seats are actually
   * sold, and it is the one line where the multiplication means something.
   */
  amountCents?: number;
}

/**
 * Turn a computed bill into the subscription lines Stripe should hold.
 *
 * The SAME breakdown that renders the billing screen, so the customer cannot be
 * shown one number and charged another — which is exactly what the previous
 * model allowed, and how it ended up with two contradictory price lists.
 *
 * A line whose quantity is zero is omitted, not sent as 0: Stripe keeps a
 * zero-quantity item on the subscription and it shows on the invoice as a line
 * for something the customer switched off.
 */
export function stripeLinesForBill(
  bill: {
    seatCount: number;
    observerSeatCount?: number;
    spaces: Array<{ cost: { lines: Array<{ moduleKey: string; monthlyCents: number }> } }>;
    usage: Array<{ moduleKey: string; monthlyCents: number }>;
    addOns: Array<{ key: string; monthlyCents?: number }>;
    /** Set when a fixed price has been agreed — see applyAgreement. */
    agreement?: { monthlyCents: number } | null;
  },
): StripeLine[] {
  /*
    An agreed price is the WHOLE subscription, not a line added to it.

    Checked first, and it returns — the seats and the aggregates below are the
    price list, and this customer is not on the price list. Emitting both would
    charge them the sum of the two.

    A zero agreed price is still a line, at €0.00. Dropping it would leave the
    subscription with no items at all, which Stripe refuses, and would make a
    deliberately free customer indistinguishable from a broken sync.
  */
  if (bill.agreement) {
    return [{
      lookupKey: stripeLookupKey('agreed', ''),
      quantity: 1,
      amountCents: Math.max(0, Math.round(bill.agreement.monthlyCents)),
      describe: `agreed price — ${bill.agreement.monthlyCents}c`,
    }];
  }

  const lines: StripeLine[] = [];

  if (bill.seatCount > 0) {
    lines.push({
      lookupKey: stripeLookupKey('seat', ''),
      quantity: bill.seatCount,
      describe: `${bill.seatCount} seat(s)`,
    });
  }

  // Its own line, not folded into the seat count: an invoice that says "12
  // seats" when two of them cost two euros is a support ticket.
  if ((bill.observerSeatCount ?? 0) > 0) {
    lines.push({
      lookupKey: stripeLookupKey('seat_observer', ''),
      quantity: bill.observerSeatCount!,
      describe: `${bill.observerSeatCount} observer seat(s)`,
    });
  }

  /*
    Everything the workspaces cost, as ONE line, priced at a cent a unit with
    the amount in the quantity.

    It was a line per module and a line per usage ladder, which reached 19 of
    Stripe's 20-line ceiling for an organization with two workspaces. One more
    module anywhere and checkout failed outright — a shape that breaks as a
    customer grows.

    Modules and usage are summed together because they are the same answer to
    the same question: what do the workspaces cost? Splitting them would buy a
    second line and explain nothing the billing page does not already show
    per workspace, per module, to the cent.
  */
  const workspaceCents =
    bill.spaces.reduce((sum, sp) => sum + sp.cost.lines.reduce((n, l) => n + l.monthlyCents, 0), 0) +
    bill.usage.reduce((sum, u) => sum + Math.max(0, u.monthlyCents), 0);
  if (workspaceCents > 0) {
    lines.push({
      lookupKey: stripeLookupKey('workspaces', ''),
      quantity: 1,
      amountCents: workspaceCents,
      describe: `workspaces — ${workspaceCents}c`,
    });
  }

  // Everything bought once for the organization, likewise.
  const optionCents = bill.addOns.reduce((sum, a) => sum + Math.max(0, a.monthlyCents ?? 0), 0);
  if (optionCents > 0) {
    lines.push({
      lookupKey: stripeLookupKey('options', ''),
      quantity: 1,
      amountCents: optionCents,
      describe: `options — ${optionCents}c`,
    });
  }

  return lines;
}
