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
 *     space bill = base + Σ bands ( units in band × band price )
 *
 * EVERYTHING IS PER SPACE — the base, the included units, and the ladder — and
 * that consistency is the point. The module is switched on per space and paid
 * for per space, so counting somewhere else to decide the rate makes the one
 * number on the screen impossible to check: the person looking at a space can
 * see what is in it, and cannot see what is in the others.
 *
 * An earlier version pooled the ladder across the organization, so a landlord
 * with five hundred flats over ten sites reached the cheap bands instead of
 * being billed as ten small customers. It is a real saving — around half — but
 * it cost the invariant every other module keeps, that a space's price is the
 * sum of what that space switched on, and it made the panel need two counts to
 * explain one number. Per space it still lands near €1.14 an asset at that
 * size, which is where per-unit software of this kind sits anyway.
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
  /** Units the space's base price covers, charged at nothing. */
  included: number;
  /** Ascending, the last one open-ended. */
  bands: UsageBand[];
}

/**
 * The ladders. One entry per module that bills by use — everything absent from
 * this table is a plain switch and is priced by MODULE_MONTHLY_CENTS alone.
 *
 * Assets: €9 per space covers the first 10 in it, then €1.20 → €0.30 as that
 * space grows. Ten assets in a space cost nothing extra; a thousand in one
 * works out near €0.59 each, under what per-unit property software charges for
 * far less.
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

  /*
    CRM: €15 per space covers the first 50 clients in it, then €0.30 → €0.05.

    The first band is €0.30 on purpose — €15 spread over 50 clients IS €0.30
    each, so client 51 costs exactly what clients 1–50 implicitly did. No cliff
    at the boundary, and nobody has to be talked through why crossing 50 made
    the price jump. Every rung below is a genuine discount from that rate.

    A tradesman with forty regulars pays €15 and never thinks about it. A firm
    with a thousand pays €210 — about €0.21 a client — which is far less than
    per-contact CRMs charge and, more to the point, less than the value of
    having those thousand relationships in the same place as the work.

    Deliberately NOT per seat, the usual CRM model: the people who most need a
    client list here — a dispatcher, an office manager — are already paying for
    a seat, and charging again for the same person to open a different tab is
    the kind of pricing customers resent long before they cancel.
  */
  crm: {
    unit: 'client',
    included: 50,
    bands: [
      { upTo: 250, unitCents: 30 },
      { upTo: 1000, unitCents: 18 },
      { upTo: 5000, unitCents: 10 },
      { upTo: null, unitCents: 5 },
    ],
  },

  /*
    Client Portal: €49 for the first, €29 for every one after it.

    A ladder rather than a flat switch, because portals are not interchangeable
    with each other the way assets are with each other. The FIRST portal is the
    expensive part of the work — a customer-facing front door, its own branding,
    its own intake — and the second one is largely the same machinery pointed at
    a different audience. So the base carries the first portal and the ladder
    prices the rest, which is what an operator running a rental portal and a
    logistics portal actually experiences: the second one is cheaper.

    Same shape as every other counted module, so it needs no special case
    anywhere: `included: 1` means the base price already bought one.
  */
  b2c_portal: {
    unit: 'portal',
    included: 1,
    bands: [{ upTo: null, unitCents: 2900 }],
  },
};

/** Units a space gets before its ladder starts. Zero for a plain switch. */
export function includedUnits(moduleKey: string): number {
  return usagePriceFor(moduleKey)?.included ?? 0;
}

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
  /** What was counted in this space. */
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

  const included = price.included;
  const count = Math.max(0, Math.floor(Number(units) || 0));
  if (count <= included) {
    return {
      ...EMPTY(moduleKey, price.unit, included),
      units: count,
      marginalUnitCents: marginalUnitCents(moduleKey, count),
    };
  }

  const lines: UsageCostLine[] = [];
  let floor = included; // last unit already accounted for

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
    included,
    billableUnits: count - included,
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
 * One exclusion, deliberate, because a count is a promise and this is the
 * promise: RETIRED DOESN'T COUNT. Stop using it, stop paying for it — and the
 * record stays, so its history survives without becoming a bill.
 *
 * (It used to exclude sub-assets too, back when an asset could sit inside
 * another. Nesting is gone, so every asset is simply an asset.)
 *
 * A plain object, not a Prisma import: shared must not depend on the ORM, and a
 * `where` clause is JSON. Both the billing service and the assets service spread
 * it into their own queries, so neither can drift from the other.
 */
export const BILLABLE_ASSET_WHERE = {
  status: { not: 'RETIRED' },
} as const;

/**
 * A client counts while it is active. Deactivate one and it stops being billed;
 * the record and its history stay, exactly as with a retired asset.
 */
export const BILLABLE_CLIENT_WHERE = {
  isActive: true,
} as const;

/**
 * A portal counts while it is switched on. A portal that is off serves nobody,
 * so it is not charged for — turning it off has to be a real lever, or nobody
 * turns anything off and the count only ever grows.
 */
export const BILLABLE_PORTAL_WHERE = {
  isActive: true,
} as const;
