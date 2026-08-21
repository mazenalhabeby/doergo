/**
 * What must exist in Stripe for this pricing model, derived from the price list.
 *
 * The tier model kept its Stripe Price IDs in eight environment variables. That
 * does not survive contact with this model: sixteen modules, eleven add-ons, a
 * seat and three usage lines, each monthly and annual, is sixty-two IDs. Sixty-two
 * environment variables is not configuration, it is a second copy of the price
 * list that drifts from the first.
 *
 * So nothing is configured. Every price carries a deterministic Stripe
 * `lookup_key` derived from the thing it prices, and both the sync script and
 * the runtime compute the same key from the same table:
 *
 *     hbcfield_module_crm_monthly
 *     hbcfield_addon_invoicing_annual
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

import { AVAILABLE_MODULES } from '../types';
import { MODULE_MONTHLY_CENTS, SEAT_MONTHLY_CENTS, ANNUAL_MONTHS_CHARGED } from './module-pricing';
import { AVAILABLE_ADD_ONS } from './add-ons';
import { MODULE_USAGE_PRICING } from './usage-pricing';
import type { BillingInterval } from './plans';

/** Every price this system creates is prefixed, so a shared Stripe account stays legible. */
export const STRIPE_LOOKUP_PREFIX = 'hbcfield';

export type StripeLineKind = 'seat' | 'module' | 'addon' | 'usage';

/** The stable lookup key for one billable line. Same function, script and runtime. */
export function stripeLookupKey(kind: StripeLineKind, key: string, interval: BillingInterval): string {
  return kind === 'seat'
    ? `${STRIPE_LOOKUP_PREFIX}_seat_${interval}`
    : `${STRIPE_LOOKUP_PREFIX}_${kind}_${key}_${interval}`;
}

/** One product/price pair the account is expected to hold. */
export interface StripeCatalogEntry {
  kind: StripeLineKind;
  /** Module key, add-on key, or '' for the seat. */
  key: string;
  interval: BillingInterval;
  lookupKey: string;
  /** Shown on the invoice and in the Stripe dashboard. */
  productName: string;
  /** Unit amount in EUR cents. For `usage` this is 1 — the quantity carries the total. */
  unitAmountCents: number;
  /** Stripe recurring interval. */
  recurring: 'month' | 'year';
}

const annual = (monthlyCents: number) => monthlyCents * ANNUAL_MONTHS_CHARGED;

/**
 * Everything that should exist in Stripe, computed from the price list.
 *
 * Deliberately a function rather than a constant: it reads the live tables, so a
 * price change here can never leave a stale catalogue behind for the sync to
 * compare against.
 */
export function stripeCatalog(): StripeCatalogEntry[] {
  const out: StripeCatalogEntry[] = [];
  const intervals: BillingInterval[] = ['monthly', 'annual'];

  const push = (kind: StripeLineKind, key: string, name: string, monthlyCents: number) => {
    for (const interval of intervals) {
      out.push({
        kind,
        key,
        interval,
        lookupKey: stripeLookupKey(kind, key, interval),
        productName: name,
        unitAmountCents: interval === 'annual' ? annual(monthlyCents) : monthlyCents,
        recurring: interval === 'annual' ? 'year' : 'month',
      });
    }
  };

  push('seat', '', 'HBCField — User seat', SEAT_MONTHLY_CENTS);

  for (const m of AVAILABLE_MODULES) {
    const price = MODULE_MONTHLY_CENTS[m.key as string] ?? 0;
    if (price <= 0) continue; // a €0 module would be an invoice line nobody can cancel
    push('module', m.key as string, `HBCField — ${m.label}`, price);
  }

  for (const a of AVAILABLE_ADD_ONS) {
    push('addon', a.key, `HBCField — ${a.label}`, a.monthlyCents);
  }

  // One cent per unit; the quantity carries what the ladder came to. See the
  // note at the top for why Stripe's own tiered pricing cannot express a
  // per-space graduated ladder.
  for (const key of Object.keys(MODULE_USAGE_PRICING)) {
    const label = AVAILABLE_MODULES.find((m) => m.key === key)?.label ?? key;
    for (const interval of intervals) {
      out.push({
        kind: 'usage',
        key,
        interval,
        lookupKey: stripeLookupKey('usage', key, interval),
        productName: `HBCField — ${label} usage`,
        /*
          One cent a unit monthly, TEN cents a unit annually.

          The quantity is always the ladder's MONTHLY cents, on both intervals,
          so the annual discount lives in the price exactly as it does for every
          other line. Leaving this at 1 for annual charged a year of usage at one
          month's rate — a silent under-bill that grew with the customer, since
          it is the biggest accounts whose ladders carry the most.
        */
        unitAmountCents: interval === 'annual' ? ANNUAL_MONTHS_CHARGED : 1,
        recurring: interval === 'annual' ? 'year' : 'month',
      });
    }
  }

  return out;
}

/** One line of a subscription: which price, and how many. */
export interface StripeLine {
  lookupKey: string;
  quantity: number;
  /** For logs and for the dry-run report — never sent to Stripe. */
  describe: string;
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
    spaces: Array<{ cost: { lines: Array<{ moduleKey: string; monthlyCents: number }> } }>;
    usage: Array<{ moduleKey: string; monthlyCents: number }>;
    addOns: Array<{ key: string }>;
  },
  interval: BillingInterval,
): StripeLine[] {
  const lines: StripeLine[] = [];

  if (bill.seatCount > 0) {
    lines.push({
      lookupKey: stripeLookupKey('seat', '', interval),
      quantity: bill.seatCount,
      describe: `${bill.seatCount} seat(s)`,
    });
  }

  // A module is billed once per SPACE that switched it on — the same shape
  // seats already had, so one quantity change covers switching it off anywhere.
  const spacesPerModule = new Map<string, number>();
  for (const space of bill.spaces) {
    for (const line of space.cost.lines) {
      spacesPerModule.set(line.moduleKey, (spacesPerModule.get(line.moduleKey) ?? 0) + 1);
    }
  }
  for (const [moduleKey, count] of [...spacesPerModule].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push({
      lookupKey: stripeLookupKey('module', moduleKey, interval),
      quantity: count,
      describe: `${moduleKey} × ${count} space(s)`,
    });
  }

  // Ladders, aggregated per module across every space, in cents.
  const usagePerModule = new Map<string, number>();
  for (const u of bill.usage) {
    if (u.monthlyCents <= 0) continue;
    usagePerModule.set(u.moduleKey, (usagePerModule.get(u.moduleKey) ?? 0) + u.monthlyCents);
  }
  for (const [moduleKey, cents] of [...usagePerModule].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push({
      lookupKey: stripeLookupKey('usage', moduleKey, interval),
      // Annual charges ten months of the same monthly ladder, matching every
      // other line — the discount lives in the price, not in the quantity.
      quantity: cents,
      describe: `${moduleKey} usage — ${cents}c`,
    });
  }

  for (const a of [...bill.addOns].sort((x, y) => x.key.localeCompare(y.key))) {
    lines.push({
      lookupKey: stripeLookupKey('addon', a.key, interval),
      quantity: 1,
      describe: a.key,
    });
  }

  return lines;
}
