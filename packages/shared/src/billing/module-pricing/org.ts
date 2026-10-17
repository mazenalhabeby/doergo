/** The whole organization's bill, the quantities Stripe is told, and a price as words. */
import type { UsageCost } from '../usage-pricing';
import { addOnsMonthlyCost, type AddOnCostLine } from '../add-ons';
import {
  OBSERVER_SEAT_MONTHLY_CENTS,
  SEAT_MONTHLY_CENTS,
  moduleMonthlyCents,
  spaceMonthlyCost,
  type SpaceCost,
  type SpaceModules,
} from './space';

export interface OrgCostBreakdown {
  /** Full-price seats — what Stripe is billed. staff + externalFullPrice. */
  seatCount: number;
  seatMonthlyCents: number;
  /*
    The composition of that number, for the screen only.

    An external SUPERVISOR costs the same €9.99 as our own staff — they approve
    hours and follow the work — so they sit inside `seatCount` and Stripe is
    told one quantity, as before. But "People: 11 × €9.99" then hides that two
    of the eleven work for a client, which is the first thing anybody asks when
    they read the bill.

    These two always sum to `seatCount`; they never change what is charged.
  */
  staffSeatCount: number;
  externalSeatCount: number;
  /** External observers — read one site, raise a job. Priced separately. */
  observerSeatCount: number;
  observerSeatMonthlyCents: number;
  spacesMonthlyCents: number;
  /** The volume ladders — assets and anything else billed by a count. */
  usageMonthlyCents: number;
  /** Capabilities bought once for the whole organization, not per space. */
  addOnsMonthlyCents: number;
  /**
   * What is actually charged.
   *
   * Equal to `listMonthlyCents` for every organization on the price list. When
   * an operator has agreed a fixed price, this is that price — see
   * `applyAgreement`, which is the ONLY thing that may make the two differ.
   */
  monthlyCents: number;
  /**
   * What the price list says this organization's usage comes to.
   *
   * Always computed, even for a customer who does not pay it: it is what the
   * renewal conversation is about, what the drift alert watches, and what the
   * customer sees struck through on their own billing page.
   */
  listMonthlyCents: number;
  /** Set only when a fixed price has been agreed with this organization. */
  agreement?: {
    monthlyCents: number;
    until: string | null;
    note: string | null;
    /** The list price when the deal was struck — the baseline drift is measured from. */
    listCentsAtAgreement: number | null;
  } | null;
  spaces: Array<{ spaceId: string; spaceName: string; cost: SpaceCost }>;
  /** Every space's counted modules, flattened — one entry per space per module. */
  usage: UsageCost[];
  /** Each purchased add-on priced. */
  addOns: AddOnCostLine[];
}

/**
 * The whole bill: every user, plus every space.
 *
 * The halves are reported separately as well as summed, because "why is my bill
 * this?" is the question this object exists to answer, and a total with no parts
 * is the shape of billing screen people write in about.
 */
export function orgMonthlyCost(input: {
  seatCount: number;
  /** Observer seats. Omitted = none, so every existing caller is unchanged. */
  observerSeatCount?: number;
  /** How many of `seatCount` are external. Display only; omitted = none. */
  externalSeatCount?: number;
  spaces: SpaceModules[];
  /** Capabilities bought once for the organization — see add-ons.ts. */
  addOns?: string[] | null;
  /** Override for a negotiated seat price; defaults to the list price. */
  seatMonthlyCents?: number;
}): OrgCostBreakdown {
  const seatPrice = input.seatMonthlyCents ?? SEAT_MONTHLY_CENTS;

  const spaces = input.spaces.map((s) => ({
    spaceId: s.spaceId,
    spaceName: s.spaceName,
    cost: spaceMonthlyCost(s.enabledModules, s.usage),
  }));

  const addOnCost = addOnsMonthlyCost(input.addOns);

  const seatMonthlyCents = Math.max(0, input.seatCount) * seatPrice;
  const observerSeatCount = Math.max(0, input.observerSeatCount ?? 0);
  // Not affected by a negotiated seat price: `seatMonthlyCents` overrides the
  // STAFF seat, and a contract that discounts staff says nothing about this.
  const observerSeatMonthlyCents = observerSeatCount * OBSERVER_SEAT_MONTHLY_CENTS;
  const spacesMonthlyCents = spaces.reduce((sum, s) => sum + s.cost.baseMonthlyCents, 0);
  const usageMonthlyCents = spaces.reduce((sum, s) => sum + s.cost.usageMonthlyCents, 0);
  const monthlyCents =
    seatMonthlyCents +
    observerSeatMonthlyCents +
    spacesMonthlyCents +
    usageMonthlyCents +
    addOnCost.monthlyCents;

  return {
    seatCount: input.seatCount,
    seatMonthlyCents,
    // Clamped so the two halves can never sum to more than the whole, whatever
    // a caller passes.
    externalSeatCount: Math.min(Math.max(0, input.externalSeatCount ?? 0), Math.max(0, input.seatCount)),
    staffSeatCount:
      Math.max(0, input.seatCount) -
      Math.min(Math.max(0, input.externalSeatCount ?? 0), Math.max(0, input.seatCount)),
    observerSeatCount,
    observerSeatMonthlyCents,
    spacesMonthlyCents,
    usageMonthlyCents,
    addOnsMonthlyCents: addOnCost.monthlyCents,
    monthlyCents,
    // No agreement has been applied at this point, so the two are the same
    // number. `applyAgreement` is the only thing that may separate them, and it
    // runs once, at the end of the bill computation.
    listMonthlyCents: monthlyCents,
    spaces,
    usage: spaces.flatMap((s) => s.cost.usage),
    addOns: addOnCost.lines,
  };
}

/**
 * How many SPACES have each module switched on.
 *
 * This is the shape a subscription is billed in: one line per module, quantity =
 * spaces using it — exactly how seats already work, so the same proration path
 * handles both, and switching a module off in one space decrements a quantity
 * instead of needing a bespoke credit.
 */
export function moduleQuantities(spaces: SpaceModules[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const space of spaces) {
    for (const key of new Set(space.enabledModules ?? [])) {
      if (moduleMonthlyCents(key) <= 0) continue;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Cents as money, for the rare caller that is not a React component.
 *
 * Whole euros lose the decimals — "€55", not "€55.00" — because a price list
 * full of trailing zeros is harder to scan, and €9.99 keeps them because that
 * is the price.
 */
export function formatCents(cents: number, currency = '€'): string {
  return `${currency}${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
