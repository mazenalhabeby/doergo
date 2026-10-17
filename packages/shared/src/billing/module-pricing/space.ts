/** Seat and module prices, and one workspace's bill. */
import { billsByUsage, type UsageCost, usageCost } from '../usage-pricing';
import { AVAILABLE_MODULES } from '../../types';

/** Per user, per month. The same for everyone who works here. */
export const SEAT_MONTHLY_CENTS = 999;

/**
 * The observer seat: an outsider who watches, and can raise a job.
 *
 * A client's representative is not a user of the product in the sense a seat
 * prices. They read one site's board and open the occasional task; they clock
 * nothing, approve nothing, assign nothing, and cannot reach anything the
 * organization owns. Charging a full staff seat for that is the same mistake as
 * charging for a portal login, which has always been free.
 *
 * Two euros rather than one on purpose: a euro reads as free-with-friction and
 * invites a conversation about waiving it. A fifth of a seat is a real number
 * that holds its value.
 *
 * ⚠️ Priced from the permissions the member actually HOLDS, never from the name
 * of their role — see `isObserverSeat`. Roles are editable per organization, so
 * a price that followed the label would be set by the customer.
 */
export const OBSERVER_SEAT_MONTHLY_CENTS = 200;

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
