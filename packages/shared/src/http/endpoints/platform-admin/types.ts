/** What the console reads about operators, organizations, mail, staff, prices and Stripe. */
import type { PlatformCapability } from '../../../platform/permissions';
import type { BillingMode } from '../../../billing/types';

type Id = { id: string };

type Empty = Record<string, never>;

// ── Answer shapes ─────────────────────────────────────────────────────────────

/** A cursor page as the server sends it — read with `unwrap: 'raw'`. */
export interface PlatformCursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

export interface PlatformMeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  twoFactorEnabled?: boolean;
  /** Server-authoritative: this session may only enrol a second factor. */
  enrolmentRequired?: boolean;
  isSupportSupervisor?: boolean;
  supportTeamIds?: string[];
}

export interface PlatformMe {
  user: PlatformMeUser;
  permissions: PlatformCapability[];
}

/** What sign-in and every 2FA change return: a fresh token and who you are now. */
export interface PlatformSessionResponse extends PlatformMe {
  token: string;
  expiresIn?: number;
}

export type PlatformLoginResponse = PlatformSessionResponse | { needs2fa: true };

export interface PlatformOverview {
  totalOrgs: number;
  trialing: number;
  suspended: number;
  newLast30: number;
  byStatus: Record<string, number>;
  seats: number;
  mrrCents: number;
  arrCents: number;
  agreedCount: number;
  agreedAwayCents: number;
  listMrrCents: number;
}

export interface PlatformBillingAlert {
  id: string;
  kind: 'DROP' | 'SYNC_FAILED' | 'CONTRACT_DRIFT' | 'CONTRACT_EXPIRING';
  organizationId: string;
  organizationName: string;
  billingMode: BillingMode;
  fromCents: number | null;
  toCents: number | null;
  dropCents: number | null;
  detail: string | null;
  occurrences: number;
  lastSeenAt: string;
  createdAt: string;
  acknowledgedAt: string | null;
}

export interface PlatformOrgRow {
  id: string;
  name: string;
  planTier: string | null;
  subStatus: string;
  trialEndsAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  memberCount: number;
  seats: number;
  addOns: string[];
  mrrCents: number;
  billingMode: BillingMode;
  invoiceDueDays: number;
  agreedMonthlyCents: number | null;
  agreedListCents: number | null;
  agreedUntil: string | null;
  agreedNote: string | null;
  agreedSetAt: string | null;
}

export interface PlatformOrgMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: string;
  isActive: boolean;
}

export interface PlatformOrgDetail extends Omit<PlatformOrgRow, 'memberCount'> {
  listMonthlyCents: number | null;
  enabledModules: string[];
  hasBillingEmail: boolean;
  currentPeriodEnd: string | null;
  members: PlatformOrgMember[];
  memberTotal: number;
}

export interface PlatformMailRouteStatus {
  label: string;
  host: string;
  port: number;
  ok: boolean;
  error: string | null;
}

export interface PlatformMailStatus {
  configured: boolean;
  ok: boolean;
  routes?: PlatformMailRouteStatus[];
  host: string | null;
  port: number | null;
  error: string | null;
}

export interface PlatformStaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  twoFactorEnabled?: boolean;
  lastLoginAt: string | null;
}

export interface PlatformPriceModule {
  key: string;
  label: string;
  description: string;
  group: string;
  monthlyCents: number;
  counted: boolean;
}

export interface PlatformPriceAddOn {
  key: string;
  label: string;
  description: string;
  group: string;
  monthlyCents: number;
}

export interface PlatformPriceBand {
  upTo: number | null;
  unitCents: number;
}

export interface PlatformPriceLadder {
  moduleKey: string;
  label: string;
  unit: string;
  included: number;
  bands: PlatformPriceBand[];
}

export interface PlatformPriceList {
  seatMonthlyCents: number;
  modules: PlatformPriceModule[];
  addOns: PlatformPriceAddOn[];
  ladders: PlatformPriceLadder[];
  catalogueSize: number;
}

export interface PlatformStripeStatus {
  configured: boolean;
  expected: number;
  matched: number;
  missing: { lookupKey: string; cents: number; productName: string }[];
  mismatched: { lookupKey: string; codeCents: number; stripeCents: number; priceId: string }[];
  orphaned: { lookupKey: string; cents: number; interval: string; priceId: string }[];
}

export { Id, Empty };
