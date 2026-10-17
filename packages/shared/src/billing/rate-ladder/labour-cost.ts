/** Keeping labour cost to those who may see it: stripping it from answers, and a rate in cents made safe. */

/**
 * Take the cost side off anything on its way to somebody who may not see it.
 *
 * ⚠️ WHOEVER RAISES AN INVOICE IS NOT AUTOMATICALLY ENTITLED TO THE MARGIN.
 * `canManageInvoices` is an office job — build the bill, send it, chase it — and
 * what the labour cost the company is a different question, asked by a
 * different person. Bundling them means the first clerk hired can read the
 * company's margin on every job, which is the sort of thing nobody notices
 * until it matters.
 *
 * ⚠️ STRIPPED AT THE BOUNDARY, not hidden in the UI. A field that reaches the
 * browser has been disclosed, whatever the screen chooses to draw — and this
 * one is a number a client must never see beside their own.
 *
 * Deliberately shallow and NAMED: it walks the two lists that carry a rate and
 * nothing else. A clever deep walk over an arbitrary payload is how an
 * unrelated field goes missing; a named list is how a NEW one gets forgotten,
 * so `COST_BEARING_LISTS` is the place to add it and the guard test reads it.
 */
const COST_BEARING_LISTS = ['items', 'workEntries', 'dayEntries', 'hourEntries'] as const;

export function stripLabourCost<T>(payload: T, mayViewCost: boolean): T {
  if (mayViewCost || !payload || typeof payload !== 'object') return payload;
  const src = payload as Record<string, unknown>;
  let touched = false;
  const out: Record<string, unknown> = { ...src };

  for (const key of COST_BEARING_LISTS) {
    const list = src[key];
    if (!Array.isArray(list)) continue;
    touched = true;
    out[key] = list.map((line) => {
      if (!line || typeof line !== 'object') return line;
      const { costRateCents, costCents, costHourRateCents, costDayRateCents, ...rest } = line as Record<string, unknown>;
      void costRateCents;
      void costCents;
      void costHourRateCents;
      void costDayRateCents;
      return rest;
    });
  }

  /*
    ⚠️ `twoRates` goes too. It is derived FROM cost rates, so leaving it says
    "there is a margin here" to somebody who may not see one — an answer to the
    question they were not allowed to ask.
  */
  if ('twoRates' in out) { out.twoRates = false; touched = true; }

  return (touched ? out : payload) as T;
}

/**
 * A rate as it may be STORED: whole cents, never negative, and bounded.
 *
 * ⚠️ The bound is not fussiness. These arrive from a form, are multiplied by
 * hours, and land in an organization's books — an unbounded integer is a way to
 * put an absurd total on an invoice from a browser, and a fractional cent is a
 * rounding bug waiting for a large one.
 *
 * Returns null for anything unusable, which the ladder reads as "inherit" —
 * the safe direction, because the level above is always a real rate somebody
 * set on purpose.
 */
export const MAX_RATE_CENTS = 1_000_000; // €10,000/hour

export function cleanRateCents(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const whole = Math.round(n);
  if (whole < 0 || whole > MAX_RATE_CENTS) return null;
  return whole;
}

/**
 * May this caller see — or set — what labour COSTS?
 *
 * Admins hold every permission by being admins; everyone else needs
 * `canViewLabourCost`, read from the server-resolved access first and the
 * flattened flag second. One answer for every route that carries a cost.
 */
export function mayViewLabourCost(user: unknown): boolean {
  const u = user as { role?: string; canViewLabourCost?: boolean; access?: { org?: Record<string, boolean> } } | null;
  if (!u) return false;
  if (u.role === 'ADMIN' || u.role === 'CLIENT') return true;
  return u.access?.org?.canViewLabourCost === true || u.canViewLabourCost === true;
}

// ⚠️ Every name a cost travels under. `costDayCents` (a work role's / a member's
// day COST) and the invoice line's hour/day cost rates were missing, so a record
// carrying one passed this walk untouched.
const COST_KEYS = new Set([
  'costRateCents', 'inheritedCostRateCents', 'costCents', 'profileCostRateCents', 'profileCostDayCents',
  'costDayCents', 'costHourRateCents', 'costDayRateCents',
]);

/**
 * Remove every cost rate from a response on its way to somebody who may not see
 * one — workspaces, members, assignments, at any depth.
 *
 * ⚠️ At the BOUNDARY, not in the screen: a field that reaches the browser has
 * been disclosed whatever the page chooses to draw. Unlike `stripLabourCost`
 * (two named invoice lists) this walks the whole payload, because a cost rate
 * rides on records — a workspace, a member, an assignment — that appear inside
 * many different responses. Bounded: plain objects and arrays only, depth 8.
 */
export function stripCostRates<T>(payload: T, mayViewCost: boolean): T {
  if (mayViewCost) return payload;
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 8 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v instanceof Date) return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (COST_KEYS.has(k)) continue;
      out[k] = walk(x, depth + 1);
    }
    if ('twoRates' in out) out.twoRates = false;
    return out;
  };
  return walk(payload, 0) as T;
}
