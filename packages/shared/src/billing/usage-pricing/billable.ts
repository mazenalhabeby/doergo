/** The next band, and what counts as a billable asset, client or portal. */
import { usagePriceFor } from './ladders';

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
 *
 * ⚠️ A CONTACT PERSON is not a client. Somebody who exists because they work at
 * a company you deal with — the facility manager you ring, the accounts clerk
 * you email — is a property of that company, not a second customer. Counting
 * them would charge a firm with six contacts for six clients, and thirty such
 * firms would cross the free allowance for people who buy nothing. The day one
 * of them becomes a customer in their own right the flag is cleared, and they
 * count from then on.
 */
export const BILLABLE_CLIENT_WHERE = {
  isActive: true,
  isContact: false,
} as const;

/**
 * A portal counts while it is switched on. A portal that is off serves nobody,
 * so it is not charged for — turning it off has to be a real lever, or nobody
 * turns anything off and the count only ever grows.
 */
export const BILLABLE_PORTAL_WHERE = {
  isActive: true,
} as const;
