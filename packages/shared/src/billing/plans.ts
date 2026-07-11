/**
 * Billing plans — the SINGLE SOURCE OF TRUTH for HBCField's subscription tiers,
 * seat prices and per-tier feature gating. Consumed by the web app, the mobile
 * app and the NestJS backend so pricing, gating and the marketing site never
 * drift apart.
 *
 * Pricing model (matches the marketing site):
 *   • Office seat  — priced BY TIER (Starter €29 / Professional €59 / Business €99)
 *   • Field seat   — FLAT €19 per technician, regardless of tier
 *   • Enterprise   — custom quote (from €199/mo)
 *   • Annual       — 2 months free  (=> monthly × 10 per year)
 *
 * Money is stored in integer EUR **cents** to avoid float rounding.
 * Stripe Price IDs are NOT stored here — the backend resolves them from env
 * (see `STRIPE_PRICE_ENV_KEYS`) so test/live keys can differ per environment.
 */

export type PlanTier = 'starter' | 'professional' | 'business' | 'enterprise';
export type SeatType = 'office' | 'field';
export type BillingInterval = 'monthly' | 'annual';

export const PLAN_TIERS: PlanTier[] = ['starter', 'professional', 'business', 'enterprise'];

/** Field (mobile-only technician) seat — flat across all paid tiers. */
export const FIELD_SEAT_MONTHLY_CENTS = 1900; // €19 / technician / month
export const FIELD_SEAT_ANNUAL_CENTS = FIELD_SEAT_MONTHLY_CENTS * 10; // 2 months free

export const CURRENCY = 'eur';

export interface PlanDef {
  tier: PlanTier;
  /** Display name. */
  name: string;
  /** Per office seat, EUR cents. `null` for Enterprise (custom quote). */
  officeMonthlyCents: number | null;
  officeAnnualCents: number | null;
  /** Feature modules this tier unlocks org-wide (drives Organization.enabledModules). */
  modules: string[];
  /** Enterprise = sales-assisted / custom contract, not self-serve checkout. */
  custom: boolean;
}

// Feature-module keys are the same strings the existing @RequireModule guard and
// hasFeatureModule() already check. Tiers are cumulative (each includes the ones
// below). NOTE: refine this mapping against the final feature list before launch —
// the STRUCTURE is fixed; the exact membership is a product decision.
const STARTER_MODULES = [
  'subtasks',
  'checklists',
  'attachments',
  'tracking', // exact-route GPS
  'time_tracking', // geofenced clock-in / attendance
];

const PROFESSIONAL_MODULES = [
  ...STARTER_MODULES,
  'service_reports',
  'recurring',
  'custom_fields',
  'overtime',
  'invoicing', // customer invoicing feature
];

const BUSINESS_MODULES = [
  ...PROFESSIONAL_MODULES,
  'multi_org',
  'audit_log',
  'workflows',
  'sprints',
  'epics',
  'phases',
];

// Enterprise unlocks everything Business has (plus bespoke add-ons handled per contract).
const ENTERPRISE_MODULES = [...BUSINESS_MODULES];

export const PLANS: Record<PlanTier, PlanDef> = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    officeMonthlyCents: 2900,
    officeAnnualCents: 29000, // €29 × 10
    modules: STARTER_MODULES,
    custom: false,
  },
  professional: {
    tier: 'professional',
    name: 'Professional',
    officeMonthlyCents: 5900,
    officeAnnualCents: 59000,
    modules: PROFESSIONAL_MODULES,
    custom: false,
  },
  business: {
    tier: 'business',
    name: 'Business',
    officeMonthlyCents: 9900,
    officeAnnualCents: 99000,
    modules: BUSINESS_MODULES,
    custom: false,
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    officeMonthlyCents: null, // from €199/mo — custom quote
    officeAnnualCents: null,
    modules: ENTERPRISE_MODULES,
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

/** Feature modules a tier unlocks org-wide (what Organization.enabledModules should be capped to). */
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

/** Per-office-seat price for a tier + interval, EUR cents (null for Enterprise). */
export function officeSeatPriceCents(tier: PlanTier, interval: BillingInterval): number | null {
  const p = PLANS[tier];
  return interval === 'annual' ? p.officeAnnualCents : p.officeMonthlyCents;
}

/** Field-seat price, EUR cents (flat across tiers). */
export function fieldSeatPriceCents(interval: BillingInterval): number {
  return interval === 'annual' ? FIELD_SEAT_ANNUAL_CENTS : FIELD_SEAT_MONTHLY_CENTS;
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
): number | null {
  const office = officeSeatPriceCents(tier, interval);
  if (office === null) return null; // enterprise / custom
  return office * officeSeats + fieldSeatPriceCents(interval) * fieldSeats;
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
  // field seat price is flat; one price per interval reused across tiers
  field: { monthly: 'STRIPE_PRICE_FIELD_MONTHLY', annual: 'STRIPE_PRICE_FIELD_ANNUAL' },
} as const;

/** Trial length (days) — matches the marketing site ("14-day trial, no card"). */
export const TRIAL_DAYS = 14;
