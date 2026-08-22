/**
 * What a space costs, and what an organization pays.
 *
 * Two halves, answering two different questions:
 *
 *   USERS  — €9.99 each, everybody the same. How many people use the product.
 *   SPACES — the sum of the modules switched on in that space. Switch one on
 *            and the space costs more; switch it off and it costs less.
 *
 *     bill = users × seat price
 *          + Σ spaces ( Σ enabled modules ( price + ladder(count in that space) ) )
 *
 * A couple of modules carry a count whose size IS the value — assets is the
 * first — and cost their base here plus a volume ladder in usage-pricing.ts.
 * The ladder is per space, like everything else about a module, so a space's
 * price stays the sum of what THAT space switched on and can be checked from
 * the screen it is shown on.
 *
 * One flat seat means nothing has to decide whether somebody is an "office" or
 * a "field" user — a whole category of argument, and of code, that simply does
 * not exist.
 *
 * Every price is monthly EUR **cents**. Integers, because money in floating
 * point is a rounding bug waiting for a large invoice.
 *
 * Every module has a price, including the cheap ones. A space pays for exactly
 * what it switched on, so a site that never opens an attachment is not carrying
 * the storage bill for one that does — and every toggle moves the number, so
 * there is no switch that silently does nothing.
 *
 * The numbers live in ONE table. Changing a price is a one-line edit that the
 * estimator, the billing screen and the invoice all pick up together.
 */

import { AVAILABLE_MODULES } from '../types';
import { billsByUsage, usageCost, type UsageCost } from './usage-pricing';
import { addOnsMonthlyCost, type AddOnCostLine } from './add-ons';

/** Per user, per month. The same for everyone. */
export const SEAT_MONTHLY_CENTS = 999;

/*
  THERE IS NO ANNUAL INTERVAL. Everything here is monthly, and that is the whole
  billing calendar.

  A yearly option at ten months existed and was removed before anyone bought
  one: it doubled the price surface (two Stripe prices per line, two proration
  rules, an interval to switch between) to sell a discount nobody had asked for,
  and it made every screen ask a question — monthly or yearly? — in front of the
  one people actually came to answer. Reintroducing it means reintroducing that
  fork everywhere, so do it deliberately or not at all.
*/

/** Monthly price of each module, per space, in EUR cents. */
export const MODULE_MONTHLY_CENTS: Record<string, number> = {
  // Task detail — the cheapest band. Real value, but every competitor includes
  // it, so it has to read as small.
  subtasks: 300,
  checklists: 400,
  dependencies: 400,
  attachments: 500, // the only one with a real marginal cost behind it: storage
  custom_fields: 600,

  // Project / agile — weak alone, priced to be bought as a set (€20 for four).
  sprints: 500,
  story_points: 500,
  epics: 500,
  phases: 500,

  // Collaboration. Sharing a space across organizations is the feature that
  // makes two companies work in one place instead of emailing each other — it
  // is priced as the differentiator it is, not as a toggle.
  space_sharing: 2900,

  // Field service — the differentiated half, and where the margin is.
  // ServiceTitan bills per truck for this class of thing.
  //
  // `assets` is a BASE, not the whole price: it covers the first ten assets and
  // the count is priced on top of it (see usage-pricing.ts). It is lower than
  // the switches around it for exactly that reason — the module is cheap to
  // start and grows with what is in it.
  assets: 900,
  service_reports: 1500,
  // The two that replace a second product outright — a timesheet system and a
  // vehicle tracker are each bought separately, by the same customer, for more
  // than this. They are level with each other because neither is the junior
  // partner: one answers "how long", the other "where".
  time_tracking: 2500,
  tracking: 2500,

  // Client-facing — highest willingness to pay: a customer logging into the app
  // is worth more than any internal screen.
  //
  // Both are BASES, not whole prices; the count is charged on top (see
  // usage-pricing.ts). `crm` is €15 covering the first 50 clients in the space,
  // which is why it now reads lower than the switches around it — the module
  // starts cheap and grows with the list. `b2c_portal` is €49 covering the
  // first portal, with each additional one at €29.
  crm: 1500,
  b2c_portal: 4900,
};

/** A module's monthly price. An unknown key costs nothing rather than breaking a bill. */
export function moduleMonthlyCents(moduleKey: string): number {
  return MODULE_MONTHLY_CENTS[moduleKey] ?? 0;
}

export interface SpaceCostLine {
  moduleKey: string;
  monthlyCents: number;
  /**
   * True when this line is only a BASE and a count is charged on top of it at
   * org level. Anything showing a per-space total has to say so, or the number
   * reads as the whole price of a module whose price is not yet whole.
   */
  usageBilled?: boolean;
}

export interface SpaceCost {
  /** Everything this space costs: its modules, plus what its counts add. */
  monthlyCents: number;
  /** The switches alone. */
  baseMonthlyCents: number;
  /** The volume ladders alone. */
  usageMonthlyCents: number;
  /** Each enabled module priced, so a total can be checked rather than trusted. */
  lines: SpaceCostLine[];
  /** Each counted module, itemised band by band. */
  usage: UsageCost[];
}

/**
 * What one space costs a month.
 *
 * Deduplicated and filtered to the catalogue: a stale key left behind in a
 * space's list must never reach an invoice as a line nobody can explain.
 */
export function spaceMonthlyCost(
  enabledModules: string[] | null | undefined,
  /** Counts for this space's usage-billed modules — `{ assets: 9 }`. */
  usageUnits?: Record<string, number>,
): SpaceCost {
  const known = new Set(AVAILABLE_MODULES.map((m) => m.key as string));
  const seen = new Set<string>();
  const lines: SpaceCostLine[] = [];

  for (const key of enabledModules ?? []) {
    if (!known.has(key) || seen.has(key)) continue;
    seen.add(key);
    const line: SpaceCostLine = { moduleKey: key, monthlyCents: moduleMonthlyCents(key) };
    if (billsByUsage(key)) line.usageBilled = true;
    lines.push(line);
  }

  // Dearest first, then alphabetical: the expensive lines are the ones somebody
  // is looking for, and a stable order keeps an invoice comparable month to month.
  lines.sort((a, b) => b.monthlyCents - a.monthlyCents || a.moduleKey.localeCompare(b.moduleKey));

  // Only a module this space actually switched on can carry a count — otherwise
  // turning it off here would still bill for what is sitting in the space.
  const usage = Object.entries(usageUnits ?? {})
    .filter(([key]) => billsByUsage(key) && seen.has(key))
    .map(([key, units]) => usageCost(key, units))
    .sort((a, b) => b.monthlyCents - a.monthlyCents || a.moduleKey.localeCompare(b.moduleKey));

  const baseMonthlyCents = lines.reduce((sum, l) => sum + l.monthlyCents, 0);
  const usageMonthlyCents = usage.reduce((sum, u) => sum + u.monthlyCents, 0);

  return { monthlyCents: baseMonthlyCents + usageMonthlyCents, baseMonthlyCents, usageMonthlyCents, lines, usage };
}

export interface SpaceModules {
  spaceId: string;
  spaceName: string;
  enabledModules: string[];
  /** Counts for this space's usage-billed modules — `{ assets: 9 }`. */
  usage?: Record<string, number>;
}

export interface OrgCostBreakdown {
  seatCount: number;
  seatMonthlyCents: number;
  spacesMonthlyCents: number;
  /** The volume ladders — assets and anything else billed by a count. */
  usageMonthlyCents: number;
  /** Capabilities bought once for the whole organization, not per space. */
  addOnsMonthlyCents: number;
  monthlyCents: number;
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
  const spacesMonthlyCents = spaces.reduce((sum, s) => sum + s.cost.baseMonthlyCents, 0);
  const usageMonthlyCents = spaces.reduce((sum, s) => sum + s.cost.usageMonthlyCents, 0);
  const monthlyCents = seatMonthlyCents + spacesMonthlyCents + usageMonthlyCents + addOnCost.monthlyCents;

  return {
    seatCount: input.seatCount,
    seatMonthlyCents,
    spacesMonthlyCents,
    usageMonthlyCents,
    addOnsMonthlyCents: addOnCost.monthlyCents,
    monthlyCents,
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
