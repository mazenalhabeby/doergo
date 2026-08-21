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
 *          + Σ spaces ( Σ enabled modules ( price ) )
 *          + Σ usage-billed modules ( ladder(count) )
 *
 * The third term is the exception, not the rule: a couple of modules carry a
 * count whose size IS the value — assets is the first — and are priced with a
 * base here plus a volume ladder in usage-pricing.ts.
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

/** Per user, per month. The same for everyone. */
export const SEAT_MONTHLY_CENTS = 999;

/** Annual is ten months — two free, matching the seat convention in plans.ts. */
export const ANNUAL_MONTHS_CHARGED = 10;

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

  // Collaboration.
  space_sharing: 900,

  // Field service — the differentiated half, and where the margin is.
  // ServiceTitan bills per truck for this class of thing.
  //
  // `assets` is a BASE, not the whole price: it covers the first ten assets and
  // the count is priced on top of it (see usage-pricing.ts). It is lower than
  // the switches around it for exactly that reason — the module is cheap to
  // start and grows with what is in it.
  assets: 900,
  time_tracking: 1200,
  service_reports: 1500,
  tracking: 1900,

  // Client-facing — highest willingness to pay: a customer logging into the app
  // is worth more than any internal screen.
  crm: 1900,
  b2c_portal: 2900,
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
  monthlyCents: number;
  /** Each enabled module priced, so a total can be checked rather than trusted. */
  lines: SpaceCostLine[];
}

/**
 * What one space costs a month.
 *
 * Deduplicated and filtered to the catalogue: a stale key left behind in a
 * space's list must never reach an invoice as a line nobody can explain.
 */
export function spaceMonthlyCost(enabledModules: string[] | null | undefined): SpaceCost {
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

  return { monthlyCents: lines.reduce((sum, l) => sum + l.monthlyCents, 0), lines };
}

export interface SpaceModules {
  spaceId: string;
  spaceName: string;
  enabledModules: string[];
}

export interface OrgCostBreakdown {
  seatCount: number;
  seatMonthlyCents: number;
  spacesMonthlyCents: number;
  /** The volume ladders — assets and anything else billed by a count. */
  usageMonthlyCents: number;
  monthlyCents: number;
  annualCents: number;
  spaces: Array<{ spaceId: string; spaceName: string; cost: SpaceCost }>;
  usage: UsageCost[];
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
  /** Override for a negotiated seat price; defaults to the list price. */
  seatMonthlyCents?: number;
  /**
   * Counts for the usage-billed modules, org-wide — `{ assets: 17 }`.
   *
   * ORG-WIDE, not per space, and deliberately: the volume break is the whole
   * point of a ladder, and a customer with five hundred assets spread over ten
   * sites who is charged as ten small customers has been given the wrong bill.
   * The included ALLOWANCE still follows the base price — one per space that
   * has the module on — so the same customer split into small sites is not
   * charged for units a single site would have got free. A count is only
   * charged when at least one space has that module switched on.
   */
  usage?: Record<string, number>;
}): OrgCostBreakdown {
  const seatPrice = input.seatMonthlyCents ?? SEAT_MONTHLY_CENTS;

  const spaces = input.spaces.map((s) => ({
    spaceId: s.spaceId,
    spaceName: s.spaceName,
    cost: spaceMonthlyCost(s.enabledModules),
  }));

  // How many spaces switched each module on. Two jobs: a module nobody has on
  // carries no usage charge at all (otherwise turning the last space off would
  // still bill the count), and every space that pays the base price brings its
  // own included allowance with it.
  const spacesWith: Record<string, number> = {};
  for (const s of input.spaces) {
    for (const key of new Set(s.enabledModules ?? [])) spacesWith[key] = (spacesWith[key] ?? 0) + 1;
  }

  const usage = Object.entries(input.usage ?? {})
    .filter(([key]) => billsByUsage(key) && (spacesWith[key] ?? 0) > 0)
    .map(([key, units]) => usageCost(key, units, spacesWith[key]))
    .sort((a, b) => b.monthlyCents - a.monthlyCents || a.moduleKey.localeCompare(b.moduleKey));

  const seatMonthlyCents = Math.max(0, input.seatCount) * seatPrice;
  const spacesMonthlyCents = spaces.reduce((sum, s) => sum + s.cost.monthlyCents, 0);
  const usageMonthlyCents = usage.reduce((sum, u) => sum + u.monthlyCents, 0);
  const monthlyCents = seatMonthlyCents + spacesMonthlyCents + usageMonthlyCents;

  return {
    seatCount: input.seatCount,
    seatMonthlyCents,
    spacesMonthlyCents,
    usageMonthlyCents,
    monthlyCents,
    annualCents: monthlyCents * ANNUAL_MONTHS_CHARGED,
    spaces,
    usage,
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
