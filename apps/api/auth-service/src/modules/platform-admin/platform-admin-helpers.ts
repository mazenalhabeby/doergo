import type { Prisma } from '@prisma/client';
// Lean shapes — select only what billing/seat classification needs (perf).
const ORG_SELECT = {
  id: true,
  name: true,
  planTier: true,
  subStatus: true,
  billingInterval: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  suspendedAt: true,
  usesExternalWorkers: true,
  isActive: true,
  createdAt: true,
  addOns: true,
  // How they pay. On the LIST, not only the detail: "who is on invoice?" is a
  // question about the whole book, and answering it by opening organizations
  // one at a time is how a contract customer gets missed at renewal.
  billingMode: true,
  invoiceDueDays: true,
  // An agreed price, if one was struck. On the LIST for the same reason the
  // billing mode is: "who is not on the price list?" is a question about the
  // whole book, and answering it one organization at a time is how a discount
  // outlives the person who agreed it.
  agreedMonthlyCents: true,
  agreedListCents: true,
  agreedUntil: true,
  agreedNote: true,
  agreedSetAt: true,
  agreedSetById: true,
  // What this org was last billed. MRR reads THIS rather than recomputing from
  // a plan: with modules and usage there is no formula an operator console can
  // re-derive, and a second implementation of the bill is a second answer.
  subscription: { select: { lastBilledCents: true } },
} as const;

type LeanOrg = {
  id: string;
  name: string;
  planTier: string | null;
  subStatus: string;
  suspendedAt: Date | null;
  usesExternalWorkers: boolean;
  createdAt: Date;
  addOns?: string[];
  agreedMonthlyCents?: number | null;
  agreedListCents?: number | null;
  agreedUntil?: Date | null;
  subscription?: { lastBilledCents: number } | null;
};

/**
 * Monthly recurring cents for one org — what it was last actually billed.
 *
 * This used to multiply seats by a tier price. Under the module model there is
 * no such formula: the bill is seats plus each space's modules plus its usage
 * ladders plus org add-ons, and re-deriving that here would be a second
 * implementation of the bill that could disagree with the invoice. So the
 * operator console reports the number the billing engine last computed.
 *
 * Zero means "never billed" — a trial, or an org that has not checked out.
 */
function orgMrrCents(org: { subscription?: { lastBilledCents: number } | null }): number {
  return org.subscription?.lastBilledCents ?? 0;
}

const SUB_STATUSES = new Set(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE']);

/** The organization columns the console renders — one shape for the list and the drawer. */
function consoleOrgFields(o: Prisma.OrganizationGetPayload<{ select: typeof ORG_SELECT }>) {
  return {
    id: o.id,
    name: o.name,
    planTier: o.planTier ?? null,
    subStatus: o.subStatus,
    trialEndsAt: o.trialEndsAt ?? null,
    suspendedAt: o.suspendedAt ?? null,
    createdAt: o.createdAt,
    // What this org has actually BOUGHT (planTier is a vestige nothing gates on).
    addOns: o.addOns ?? [],
    billingMode: o.billingMode ?? 'AUTOMATIC',
    invoiceDueDays: o.invoiceDueDays ?? 14,
    agreedMonthlyCents: o.agreedMonthlyCents ?? null,
    agreedListCents: o.agreedListCents ?? null,
    agreedUntil: o.agreedUntil ?? null,
    agreedNote: o.agreedNote ?? null,
    agreedSetAt: o.agreedSetAt ?? null,
    mrrCents: String(o.subStatus ?? '').toUpperCase() === 'ACTIVE' && !o.suspendedAt ? orgMrrCents(o) : 0,
  };
}

export { ORG_SELECT, LeanOrg, orgMrrCents, SUB_STATUSES, consoleOrgFields };
