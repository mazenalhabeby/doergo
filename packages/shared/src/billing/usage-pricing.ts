/**
 * Modules that bill by how much you use them.
 *
 * Most modules are a switch: on costs €X a month, off costs nothing. A few are
 * not, because their value scales with a number the customer controls. Assets is
 * the first: a workshop tracking six machines and a landlord tracking six hundred
 * flats are not the same customer, and one price cannot be right for both — set
 * for the landlord it is unaffordable to the workshop; set for the workshop it
 * gives the landlord the product for nothing.
 *
 * So the module keeps its (small) base price, and the count is priced on top,
 * on a ladder that gets cheaper as it grows:
 *
 *     bill = base(module) + Σ bands ( units in band × band price )
 *
 * GRADUATED, like income tax: crossing into a cheaper band re-prices only the
 * units in that band, never the ones below it. The alternative — one rate for
 * the whole count, chosen by the total — makes the bill FALL when you add an
 * asset, which is indefensible on an invoice.
 *
 * WHY NOT PRICE BY ASSET TYPE — the obvious-looking alternative:
 *
 *   • The types are the customer's. They create "Apartments", "Vehicles",
 *     "Machines" themselves, name them, and reshape them. A price that depends
 *     on the type is a price the customer sets — rename the type, pay less.
 *   • The name predicts nothing. A machine with forty sub-parts and a fault-code
 *     catalogue costs us far more to serve than a flat worth €900 a month in
 *     rent. Type says nothing about either cost or value.
 *   • Where a type really does cost more, it is already priced. A type whose
 *     holder logs in bills through Client Portal; a type held by a customer
 *     bills through CRM. Charging again by type would be charging twice.
 *
 * Volume gives the fairness people actually want from per-type pricing — the
 * big user pays less per asset — without any of that.
 *
 * Every price is monthly EUR **cents**. Integers, because money in floating
 * point is a rounding bug waiting for a large invoice.
 */

/** One rung of the ladder. `upTo` is the last unit it covers, counted from 1. */
export interface UsageBand {
  /** Highest unit number in this band. `null` on the last band — no ceiling. */
  upTo: number | null;
  /** Price per unit inside this band, monthly EUR cents. */
  unitCents: number;
}

export interface UsagePrice {
  /** What is being counted, for labels and i18n keys: `asset`. */
  unit: string;
  /** Units the module's base price already covers, charged at nothing. */
  included: number;
  /** Ascending, the last one open-ended. */
  bands: UsageBand[];
}

/**
 * The ladders. One entry per module that bills by use — everything absent from
 * this table is a plain switch and is priced by MODULE_MONTHLY_CENTS alone.
 *
 * Assets: €9/space base covers the first 10, then €1.20 → €0.30 as it grows.
 * At ten assets it costs nothing extra; at a thousand it works out near €0.59
 * each, which is under what per-unit property software charges for far less.
 */
export const MODULE_USAGE_PRICING: Record<string, UsagePrice> = {
  assets: {
    unit: 'asset',
    included: 10,
    bands: [
      { upTo: 50, unitCents: 120 },
      { upTo: 250, unitCents: 80 },
      { upTo: 1000, unitCents: 50 },
      { upTo: null, unitCents: 30 },
    ],
  },
};

/** The ladder for a module, or `null` when it is a plain on/off switch. */
export function usagePriceFor(moduleKey: string): UsagePrice | null {
  return MODULE_USAGE_PRICING[moduleKey] ?? null;
}

/** Whether a module's bill moves with a count as well as with its switch. */
export function billsByUsage(moduleKey: string): boolean {
  return moduleKey in MODULE_USAGE_PRICING;
}

/** One band's contribution, itemised so a total can be checked rather than trusted. */
export interface UsageCostLine {
  /** First and last unit number this line covers, inclusive. */
  fromUnit: number;
  toUnit: number;
  units: number;
  unitCents: number;
  monthlyCents: number;
}

export interface UsageCost {
  moduleKey: string;
  unit: string;
  /** What was counted. */
  units: number;
  /** How many of those were free. */
  included: number;
  /** How many were charged for. */
  billableUnits: number;
  monthlyCents: number;
  /** What ONE more would cost — the number that answers "should I add it?". */
  marginalUnitCents: number;
  /**
   * The whole usage bill spread over every unit, free ones included. This is the
   * honest "works out at €x each" figure; the marginal rate is not, because the
   * units below the current band were never charged at it.
   */
  effectiveUnitCents: number;
  lines: UsageCostLine[];
}

const EMPTY = (moduleKey: string, unit: string, included: number): UsageCost => ({
  moduleKey,
  unit,
  units: 0,
  included,
  billableUnits: 0,
  monthlyCents: 0,
  marginalUnitCents: 0,
  effectiveUnitCents: 0,
  lines: [],
});

/**
 * What a count costs on a module's ladder.
 *
 * A module with no ladder costs nothing here — its whole price is its base, and
 * returning zero rather than throwing keeps an unknown key off an invoice
 * instead of taking the invoice down.
 */
export function usageCost(moduleKey: string, units: number): UsageCost {
  const price = usagePriceFor(moduleKey);
  if (!price) return EMPTY(moduleKey, 'unit', 0);

  const count = Math.max(0, Math.floor(Number(units) || 0));
  if (count <= price.included) {
    return { ...EMPTY(moduleKey, price.unit, price.included), units: count, marginalUnitCents: marginalUnitCents(moduleKey, count) };
  }

  const lines: UsageCostLine[] = [];
  let floor = price.included; // last unit already accounted for

  for (const band of price.bands) {
    const ceiling = band.upTo == null ? count : Math.min(band.upTo, count);
    if (ceiling <= floor) continue; // band sits entirely below what is billable
    const bandUnits = ceiling - floor;
    lines.push({
      fromUnit: floor + 1,
      toUnit: ceiling,
      units: bandUnits,
      unitCents: band.unitCents,
      monthlyCents: bandUnits * band.unitCents,
    });
    floor = ceiling;
    if (floor >= count) break;
  }

  const monthlyCents = lines.reduce((sum, l) => sum + l.monthlyCents, 0);
  return {
    moduleKey,
    unit: price.unit,
    units: count,
    included: price.included,
    billableUnits: count - price.included,
    monthlyCents,
    marginalUnitCents: marginalUnitCents(moduleKey, count),
    effectiveUnitCents: Math.round(monthlyCents / count),
    lines,
  };
}

/**
 * What the NEXT unit costs — the price of the decision somebody is actually
 * making, which is never the average and rarely the headline rate.
 */
export function marginalUnitCents(moduleKey: string, currentUnits: number): number {
  const price = usagePriceFor(moduleKey);
  if (!price) return 0;
  const next = Math.max(0, Math.floor(Number(currentUnits) || 0)) + 1;
  if (next <= price.included) return 0;
  for (const band of price.bands) {
    if (band.upTo == null || next <= band.upTo) return band.unitCents;
  }
  return price.bands[price.bands.length - 1]?.unitCents ?? 0;
}

/**
 * How many units are left before the price per unit drops, and to what.
 *
 * Sales copy writes itself from this ("14 more and every asset after it is
 * €0.80"), and it is the one thing a growing customer wants to know that a
 * total cannot tell them. `null` once there is no cheaper band left.
 */
export function nextUsageBreak(
  moduleKey: string,
  currentUnits: number,
): { atUnits: number; unitsAway: number; unitCents: number } | null {
  const price = usagePriceFor(moduleKey);
  if (!price) return null;
  const count = Math.max(0, Math.floor(Number(currentUnits) || 0));

  // The next unit that would actually be CHARGED — below the included allowance
  // the ladder has not started, so the break is measured from where it does.
  const nextUnit = Math.max(count, price.included) + 1;
  const idx = price.bands.findIndex((b) => b.upTo == null || nextUnit <= b.upTo);
  const band = idx >= 0 ? price.bands[idx] : undefined;
  const following = idx >= 0 ? price.bands[idx + 1] : undefined;
  if (!band || band.upTo == null || !following) return null; // already on the last rung
  if (following.unitCents >= band.unitCents) return null; // not cheaper — not a break

  const atUnits = band.upTo + 1;
  return { atUnits, unitsAway: Math.max(1, atUnits - count), unitCents: following.unitCents };
}

// ── What counts as a billable asset ──────────────────────────────────────────
/**
 * The rule, written once.
 *
 * Two exclusions, both deliberate, because a count is a promise and this is the
 * promise:
 *
 *   • SUB-ASSETS DON'T COUNT. A press broken down into four subunits and thirty
 *     components is ONE asset. Charging for the breakdown would make describing
 *     equipment properly the most expensive thing a customer could do, and the
 *     breakdown is what makes the fault codes and the cost roll-up work at all.
 *   • RETIRED DOESN'T COUNT. Stop using it, stop paying for it — and the record
 *     stays, so its history survives without becoming a bill.
 *
 * A plain object, not a Prisma import: shared must not depend on the ORM, and a
 * `where` clause is JSON. Both the billing service and the assets service spread
 * it into their own queries, so neither can drift from the other.
 */
export const BILLABLE_ASSET_WHERE = {
  parentId: null,
  status: { not: 'RETIRED' },
} as const;
