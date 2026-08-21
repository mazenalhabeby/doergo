/**
 * Organization add-ons — the premium capabilities that are not per-space modules.
 *
 * Modules are bought per SPACE, because that is where they apply: a space
 * switches on Assets and pays for the assets in it. These are different. An
 * audit log is one log for the organization. Invoicing is one ledger. Workflows
 * are defined once and assigned to spaces. Charging for them per space would
 * bill a customer with four sites four times for one thing they have once.
 *
 * So the bill has three parts, and each is priced where it is actually used:
 *
 *     bill = seats × €9.99
 *          + Σ spaces ( modules + usage ladders )
 *          + Σ org add-ons
 *
 * These keys were previously gated by TIER alone — `tierAllows('invoicing')`
 * with no price attached anywhere, so they were sold as part of a bundle and
 * priced as part of a seat. Now they are bought, which means each one has to be
 * worth its own line on an invoice. That is a higher bar than being the third
 * bullet in a pricing column, and a few of them earned a lower number for it.
 *
 * Every price is monthly EUR **cents**. Integers, because money in floating
 * point is a rounding bug waiting for a large invoice.
 */

export interface AddOnDef {
  key: string;
  /** English SOURCE, not a display string — the UI translates via `addOnI18n`. */
  label: string;
  description: string;
  /** For grouping in the UI. */
  group: 'work' | 'money' | 'insight' | 'support';
  monthlyCents: number;
}

/**
 * The catalogue. Adding an entry here is the whole job of adding an add-on:
 * it becomes purchasable, priced, gated and billable without another edit.
 */
export const AVAILABLE_ADD_ONS: AddOnDef[] = [
  // ── How work is organised ────────────────────────────────────────────────
  {
    key: 'workflows',
    label: 'Custom Workflows',
    description: 'Design your own task statuses and the transitions between them',
    group: 'work',
    monthlyCents: 2900,
  },
  {
    key: 'recurring',
    label: 'Recurring Tasks',
    description: 'Schedule work that repeats — daily, weekly, monthly',
    group: 'work',
    monthlyCents: 1200,
  },
  {
    key: 'shift_scheduling',
    label: 'Shift Scheduling',
    description: 'Shifts, rotas, and the reminder loop that chases an open shift',
    group: 'work',
    monthlyCents: 1900,
  },
  {
    key: 'overtime',
    label: 'Extra-time Approvals',
    description: 'Members request time beyond their shift; a manager approves it',
    group: 'work',
    monthlyCents: 900,
  },

  // ── Money ────────────────────────────────────────────────────────────────
  {
    key: 'invoicing',
    label: 'Invoicing',
    description: 'Turn completed work into invoices, and track what is owed',
    group: 'money',
    monthlyCents: 1900,
  },

  // ── Knowing what happened ────────────────────────────────────────────────
  {
    key: 'reports_builder',
    label: 'Report Builder',
    description: 'Build and save your own reports. Running the standard ones is free.',
    group: 'insight',
    monthlyCents: 1900,
  },
  {
    key: 'report_scheduling',
    label: 'Scheduled Reports',
    description: 'Have a report arrive by email on a schedule',
    group: 'insight',
    monthlyCents: 900,
  },
  {
    key: 'audit_log',
    label: 'Audit Log',
    description: 'Who changed what, and when — across the whole organization',
    group: 'insight',
    monthlyCents: 1500,
  },

  // ── Support ──────────────────────────────────────────────────────────────
  {
    key: 'priority_routing',
    label: 'Priority Support',
    description: 'Your tickets jump the queue',
    group: 'support',
    monthlyCents: 1900,
  },
  {
    key: 'live_chat',
    label: 'Live Chat Support',
    description: 'Talk to a person in real time, not a ticket thread',
    group: 'support',
    monthlyCents: 2900,
  },
  {
    key: 'dedicated_support',
    label: 'Dedicated Support',
    description: 'A named contact and an onboarding call',
    group: 'support',
    monthlyCents: 9900,
  },
];

/** Fast lookup — built once, not rebuilt on every guard call. */
const BY_KEY = new Map(AVAILABLE_ADD_ONS.map((a) => [a.key, a]));

/** Every add-on key, for validation and for the "everything on" case. */
export const ADD_ON_KEYS: string[] = AVAILABLE_ADD_ONS.map((a) => a.key);

/** Whether a key names a real add-on. */
export function isAddOn(key: string): boolean {
  return BY_KEY.has(key);
}

/** An add-on's monthly price. An unknown key costs nothing rather than breaking a bill. */
export function addOnMonthlyCents(key: string): number {
  return BY_KEY.get(key)?.monthlyCents ?? 0;
}

/** The catalogue entry, or null. */
export function addOnDef(key: string): AddOnDef | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * Whether an organization has bought a capability.
 *
 * The single gate the backend guard and the web/mobile nav both use. It takes
 * the org's purchased list rather than reaching for a tier, so there is no
 * ranking to reason about and no "does Business include this?" table to keep in
 * step with the price list — a thing is bought or it is not.
 *
 * Unknown keys are NOT allowed. A typo in a `@RequirePlan('reccuring')` must
 * fail closed and be caught, not quietly grant a feature to everyone.
 */
export function orgHasAddOn(purchased: string[] | null | undefined, key: string): boolean {
  if (!Array.isArray(purchased)) return false;
  return purchased.includes(key);
}

/** Translation keys, derived from the key so adding one cannot forget them. */
export const addOnI18n = {
  label: (key: string) => `addOns.${key}.label`,
  description: (key: string) => `addOns.${key}.description`,
  groupLabel: (key: string) => `addOns.groups.${key}.label`,
} as const;

export interface AddOnCostLine {
  key: string;
  monthlyCents: number;
}

/**
 * What an organization's add-ons cost a month.
 *
 * Deduplicated and filtered to the catalogue: a stale key left on an org must
 * never reach an invoice as a line nobody can explain, and must never be
 * charged twice because it appears twice in an array.
 */
export function addOnsMonthlyCost(purchased: string[] | null | undefined): {
  monthlyCents: number;
  lines: AddOnCostLine[];
} {
  const seen = new Set<string>();
  const lines: AddOnCostLine[] = [];

  for (const key of purchased ?? []) {
    if (!BY_KEY.has(key) || seen.has(key)) continue;
    seen.add(key);
    lines.push({ key, monthlyCents: addOnMonthlyCents(key) });
  }

  // Dearest first, then alphabetical: the expensive lines are the ones somebody
  // is looking for, and a stable order keeps an invoice comparable month to month.
  lines.sort((a, b) => b.monthlyCents - a.monthlyCents || a.key.localeCompare(b.key));

  return { monthlyCents: lines.reduce((sum, l) => sum + l.monthlyCents, 0), lines };
}
