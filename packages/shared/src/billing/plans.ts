/**
 * Billing plans — the SINGLE SOURCE OF TRUTH for HBCField's subscription tiers,
 * seat prices and per-tier feature gating. Consumed by the web app, the mobile
 * app and the NestJS backend so pricing, gating and the marketing site never
 * drift apart.
 *
 * Pricing model (matches the marketing site):
 *   • Office seat  — priced BY TIER (Starter €19 / Professional €49 / Business €99)
 *   • Field seat   — external/freelancer technician, FLAT €15 regardless of tier
 *   • In-house field seat — the org's OWN (employed) technician, FLAT €9 —
 *     a discount that rewards bringing techs in-house
 *   • Enterprise   — custom quote (from €199/mo)
 *   • Annual       — 2 months free  (=> monthly × 10 per year)
 *
 * Money is stored in integer EUR **cents** to avoid float rounding.
 * Stripe Price IDs are NOT stored here — the backend resolves them from env
 * (see `STRIPE_PRICE_ENV_KEYS`) so test/live keys can differ per environment.
 */

export type PlanTier = 'starter' | 'professional' | 'business' | 'enterprise';
/**
 * A billable seat type:
 *   • office        — anyone with web access (priced by tier)
 *   • field         — external/freelancer, mobile-only technician (flat €15)
 *   • field_inhouse — the org's own employed, mobile-only technician (flat €9)
 */
export type SeatType = 'office' | 'field' | 'field_inhouse';
export type BillingInterval = 'monthly' | 'annual';

export const PLAN_TIERS: PlanTier[] = ['starter', 'professional', 'business', 'enterprise'];

/** External/freelancer field (mobile-only) seat — flat across all paid tiers. */
export const FIELD_SEAT_MONTHLY_CENTS = 1900; // HOLD: live €19 until Stripe #5 prices set
export const FIELD_SEAT_ANNUAL_CENTS = FIELD_SEAT_MONTHLY_CENTS * 10; // 2 months free

/** In-house (employed) field (mobile-only) seat — discounted, flat across tiers. */
export const IN_HOUSE_FIELD_SEAT_MONTHLY_CENTS = 1900; // HOLD: = external until Stripe in-house price + env set
export const IN_HOUSE_FIELD_SEAT_ANNUAL_CENTS = IN_HOUSE_FIELD_SEAT_MONTHLY_CENTS * 10; // 2 months free

export const CURRENCY = 'eur';

export interface PlanDef {
  tier: PlanTier;
  /** Display name. */
  name: string;
  /** Per office seat, EUR cents. `null` for Enterprise (custom quote). */
  officeMonthlyCents: number | null;
  officeAnnualCents: number | null;
  /**
   * Task FEATURE modules this tier unlocks org-wide. These are the SAME keys the
   * `AVAILABLE_MODULES` catalog, `hasFeatureModule()` and `@RequireModule` use, and
   * this list is what `Organization.enabledModules` is set to on trial/checkout.
   * ONLY real, catalog-backed module keys belong here (never capability keys).
   */
  modules: string[];
  /**
   * Premium CAPABILITIES this tier unlocks that are NOT task-modules (they have no
   * entry in the AVAILABLE_MODULES catalog and are not stored on enabledModules).
   * They are gated purely by tier via `tierAllows()` — e.g. recurring, invoicing.
   */
  capabilities: string[];
  /** Enterprise = sales-assisted / custom contract, not self-serve checkout. */
  custom: boolean;
}

// ── Task feature MODULES (catalog-backed; written to Organization.enabledModules) ──
// Must only contain keys present in AVAILABLE_MODULES (packages/shared/src/types).
// Tiers are cumulative (each includes the ones below).
const STARTER_MODULES = [
  'subtasks',
  'checklists',
  'attachments',
  'tracking', // exact-route GPS
  'time_tracking', // geofenced clock-in / attendance
  'service_reports', // completion reports w/ photos & signatures — core field-service value
];

const PROFESSIONAL_MODULES = [
  ...STARTER_MODULES,
  'custom_fields',
  'dependencies',
  'crm', // per-space customer records + sales tasks
  'apartments', // per-space units directory + resident/worker assignment
  'b2c_portal', // per-space: invite customers to the app (requires crm + apartments)
];

const BUSINESS_MODULES = [
  ...PROFESSIONAL_MODULES,
  'sprints',
  'story_points',
  'epics',
  'phases',
];

// Enterprise unlocks everything Business has (plus bespoke add-ons handled per contract).
const ENTERPRISE_MODULES = [...BUSINESS_MODULES];

// ── Premium CAPABILITIES (tier-gated, NOT task-modules / not on enabledModules) ──
// Gated only by tier through tierAllows(); cumulative like the modules above.
// `priority_routing` — support tickets from this tier jump the agent queue (Pro+).
const STARTER_CAPS: string[] = [];
// `reports_builder` — custom report builder + saved/shared reports (Pro+). All
// tiers can VIEW/run the predefined report templates; only Pro+ can build & save.
// `shift_scheduling` — define shifts + rota, dynamic per-space sub-roles, and the
// shift reminder / extra-time approval loop (advanced attendance; Pro+, same tier
// as overtime which it builds on).
const PROFESSIONAL_CAPS = [...STARTER_CAPS, 'recurring', 'overtime', 'invoicing', 'priority_routing', 'reports_builder', 'shift_scheduling'];
// NOTE: `multi_org` was removed — the OrganizationAccess delegation flow isn't
// wired to any billing gate, so advertising it would be a phantom feature.
// Re-add here (with real enforcement) when multi-org delegation actually ships.
// `live_chat` — real-time human support chat (Business+).
// `report_scheduling` — scheduled report delivery by email (Business+).
const BUSINESS_CAPS = [...PROFESSIONAL_CAPS, 'workflows', 'audit_log', 'live_chat', 'report_scheduling'];
// `dedicated_support` — named contact + onboarding call, Enterprise-only.
const ENTERPRISE_CAPS = [...BUSINESS_CAPS, 'dedicated_support'];

export const PLANS: Record<PlanTier, PlanDef> = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    officeMonthlyCents: 2900,
    officeAnnualCents: 29000, // €19 × 10
    modules: STARTER_MODULES,
    capabilities: STARTER_CAPS,
    custom: false,
  },
  professional: {
    tier: 'professional',
    name: 'Professional',
    officeMonthlyCents: 5900,
    officeAnnualCents: 59000,
    modules: PROFESSIONAL_MODULES,
    capabilities: PROFESSIONAL_CAPS,
    custom: false,
  },
  business: {
    tier: 'business',
    name: 'Business',
    officeMonthlyCents: 9900,
    officeAnnualCents: 99000,
    modules: BUSINESS_MODULES,
    capabilities: BUSINESS_CAPS,
    custom: false,
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    officeMonthlyCents: null, // from €199/mo — custom quote
    officeAnnualCents: null,
    modules: ENTERPRISE_MODULES,
    capabilities: ENTERPRISE_CAPS,
    custom: true,
  },
};

/** Rank for upgrade/downgrade comparisons. */
export const TIER_RANK: Record<PlanTier, number> = {
  starter: 0,
  professional: 1,
  business: 2,
  enterprise: 3,
};

/** Feature modules a tier unlocks org-wide (what Organization.enabledModules is set to). */
export function modulesForTier(tier: PlanTier): string[] {
  return PLANS[tier].modules;
}

/** Whether a given feature module is included in a tier. */
export function tierHasModule(tier: PlanTier, moduleKey: string): boolean {
  return PLANS[tier].modules.includes(moduleKey);
}

/** The lowest tier that unlocks a given feature module (for "upgrade to X" CTAs). */
export function minTierForModule(moduleKey: string): PlanTier | null {
  for (const tier of PLAN_TIERS) {
    if (PLANS[tier].modules.includes(moduleKey)) return tier;
  }
  return null;
}

// ── Entitlements (modules ∪ capabilities) — the tier's full premium surface ──────

/** Every premium key a tier unlocks: task-modules AND non-module capabilities. */
export function entitlementsForTier(tier: PlanTier): string[] {
  return [...PLANS[tier].modules, ...PLANS[tier].capabilities];
}

/**
 * Whether a tier is entitled to a feature key (module OR capability). This is the
 * single gate the backend guard and the web/mobile nav use. O(1)-ish, no DB, no
 * array plumbing beyond the static plan table — safe to call on every request.
 *
 * Enterprise is entitled to everything (bespoke add-ons handled per contract).
 */
export function tierAllows(tier: PlanTier | null | undefined, key: string): boolean {
  if (!tier) return false;
  if (tier === 'enterprise') return true;
  const p = PLANS[tier];
  return p.modules.includes(key) || p.capabilities.includes(key);
}

/** The lowest tier that unlocks a feature key (module or capability), for upgrade CTAs. */
export function minTierForFeature(key: string): PlanTier | null {
  for (const tier of PLAN_TIERS) {
    if (PLANS[tier].modules.includes(key) || PLANS[tier].capabilities.includes(key)) return tier;
  }
  return null;
}

/** Per-office-seat price for a tier + interval, EUR cents (null for Enterprise). */
export function officeSeatPriceCents(tier: PlanTier, interval: BillingInterval): number | null {
  const p = PLANS[tier];
  return interval === 'annual' ? p.officeAnnualCents : p.officeMonthlyCents;
}

/** External field-seat price, EUR cents (flat across tiers). */
export function fieldSeatPriceCents(interval: BillingInterval): number {
  return interval === 'annual' ? FIELD_SEAT_ANNUAL_CENTS : FIELD_SEAT_MONTHLY_CENTS;
}

/** In-house field-seat price, EUR cents (flat across tiers). */
export function inHouseFieldSeatPriceCents(interval: BillingInterval): number {
  return interval === 'annual' ? IN_HOUSE_FIELD_SEAT_ANNUAL_CENTS : IN_HOUSE_FIELD_SEAT_MONTHLY_CENTS;
}

/**
 * Compute the recurring total (EUR cents) for a subscription line-up.
 * Returns null for Enterprise (custom pricing).
 */
export function subscriptionTotalCents(
  tier: PlanTier,
  interval: BillingInterval,
  officeSeats: number,
  fieldSeats: number,
  fieldInhouseSeats = 0,
): number | null {
  const office = officeSeatPriceCents(tier, interval);
  if (office === null) return null; // enterprise / custom
  return (
    office * officeSeats +
    fieldSeatPriceCents(interval) * fieldSeats +
    inHouseFieldSeatPriceCents(interval) * fieldInhouseSeats
  );
}

/**
 * The env-var key that holds the Stripe Price ID for each billable line.
 * The backend reads `process.env[STRIPE_PRICE_ENV_KEYS.starter.office.monthly]` etc.
 * Keeping only the KEY names here (not the values) means shared stays env-agnostic.
 */
export const STRIPE_PRICE_ENV_KEYS = {
  starter: {
    office: { monthly: 'STRIPE_PRICE_STARTER_OFFICE_MONTHLY', annual: 'STRIPE_PRICE_STARTER_OFFICE_ANNUAL' },
  },
  professional: {
    office: { monthly: 'STRIPE_PRICE_PRO_OFFICE_MONTHLY', annual: 'STRIPE_PRICE_PRO_OFFICE_ANNUAL' },
  },
  business: {
    office: { monthly: 'STRIPE_PRICE_BUSINESS_OFFICE_MONTHLY', annual: 'STRIPE_PRICE_BUSINESS_OFFICE_ANNUAL' },
  },
  // field seat prices are flat; one price per interval reused across tiers.
  // `field` = external/freelancer (€15); `fieldInhouse` = the org's own employed
  // technician (€9 discount).
  field: { monthly: 'STRIPE_PRICE_FIELD_MONTHLY', annual: 'STRIPE_PRICE_FIELD_ANNUAL' },
  fieldInhouse: { monthly: 'STRIPE_PRICE_FIELD_INHOUSE_MONTHLY', annual: 'STRIPE_PRICE_FIELD_INHOUSE_ANNUAL' },
} as const;

/** Trial length (days) — matches the marketing site ("14-day trial, no card"). */
export const TRIAL_DAYS = 14;
