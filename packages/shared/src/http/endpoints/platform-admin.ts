/**
 * The operator console (admin.hbcfield.com) — every `/platform/*` route it calls.
 * Gateway: modules/platform-admin (platform-auth, platform-admin,
 * platform-pricing, platform-support, platform-support-teams, platform-library).
 *
 * ⚠️ A SEPARATE REGISTRY (`platformEndpoints`), not part of `apiEndpoints`.
 * These routes take an OPERATOR token, which reaches every customer; the web
 * app and the phone hold a member token and never call them. Keeping the
 * console's table apart keeps the member apps' walk of `apiEndpoints` (and its
 * allow-list of public routes) about the member product only.
 *
 * ⚠️ Cursor lists (`orgs.list`, `audit.list`) answer `{ success, data,
 * nextCursor }`. Call them with `unwrap: 'raw'` — unwrapped by shape they would
 * be the rows alone and the cursor would be lost. Their result type is the raw
 * page for that reason.
 *
 * The answer shapes are produced by auth-service's platform-admin module and
 * read only by the console; they live here beside the routes that return them.
 */
import type { BillingMode } from '../../billing/types';
import type { PlatformCapability } from '../../platform/permissions';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';

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

export interface PlatformTicket {
  id: string;
  subject: string;
  status: string;
  priority?: string;
  createdBy?: { firstName?: string; lastName?: string; email?: string } | null;
  lastCustomerMessageAt?: string | null;
  organizationId?: string;
  assignedTeamId?: string | null;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
}
export interface PlatformTicketMessage {
  id: string;
  authorType: string;
  authorId?: string;
  authorName?: string;
  body: string;
  isInternalNote?: boolean;
  createdAt: string;
}
export type PlatformInboxView = 'all' | 'mine' | 'unassigned' | 'team';

export interface PlatformTeamMember {
  id: string;
  platformUserId: string;
  teamRole: 'MANAGER' | 'AGENT';
  user?: { firstName?: string; lastName?: string; email?: string; role?: string } | null;
}
export interface PlatformRoutingRule {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
  conditions: { planTier?: string[]; country?: string[]; state?: string[]; industry?: string[] };
}
export interface PlatformTeam {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  isActive: boolean;
  members: PlatformTeamMember[];
  routingRules: PlatformRoutingRule[];
  _count?: { members: number; routingRules: number; pinnedOrgs: number };
}
export interface PlatformTeamStaff {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}
export interface PlatformPinnedOrg {
  id: string;
  name: string;
  planTier?: string | null;
  country?: string | null;
  industry?: string | null;
}

export interface PlatformTemplateStatus {
  name: string;
  key: string;
  color: string;
  icon?: string;
  position: number;
  isFinal: boolean;
  isCanceled: boolean;
  transitions: string[];
  capabilities: string[];
}
export interface PlatformTemplateProblem {
  code: string;
  statusKey?: string;
  message: string;
}
export interface PlatformTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  industry: string | null;
  icon: string | null;
  position: number;
  isPublished: boolean;
  isBuiltIn: boolean;
  submittedByOrgId: string | null;
  submittedByOrgName: string | null;
  submittedAt: string | null;
  statuses: PlatformTemplateStatus[];
  problems: PlatformTemplateProblem[];
  advice: PlatformTemplateProblem[];
}

export interface PlatformAuditRow {
  id: string;
  actorType: 'STAFF' | 'STATIC_KEY' | 'ANONYMOUS';
  actorId: string | null;
  actorLabel: string | null;
  actorRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  method: string;
  route: string;
  action: string;
  targetOrganizationId: string | null;
  targetOrganizationName: string | null;
  summary: unknown;
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  createdAt: string;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** Staff sign-in and the operator's own session (platform-auth.controller). */
export const platformAuthEndpoints = defineEndpoints('platformAuth', {
  /** Public: a 401 here is "wrong password or code", never "your session ended". */
  login: endpoint<void, PlatformLoginResponse, { email: string; password: string; code?: string }>({
    method: 'POST',
    path: () => '/platform/auth/login',
    public: true,
  }),
  me: endpoint<void, PlatformMe>({ method: 'GET', path: () => '/platform/auth/me' }),
  /** Ends the session on the SERVER — the token stops working everywhere. */
  logout: endpoint<void, { signedOut: boolean }, Empty>({ method: 'POST', path: () => '/platform/auth/logout' }),
  /** Slides the session forward (capped server-side at PLATFORM_SESSION_MAX_SECONDS from sign-in). */
  refresh: endpoint<void, PlatformSessionResponse, Empty>({ method: 'POST', path: () => '/platform/auth/refresh' }),
  changePassword: endpoint<void, PlatformSessionResponse & { id: string }, { currentPassword: string; newPassword: string }>({
    method: 'POST',
    path: () => '/platform/auth/change-password',
  }),
  /** While 2FA is on, `code` (a current one) is required to re-key. */
  setup2fa: endpoint<void, PlatformSessionResponse & { secret: string; otpauthUri: string }, { code?: string }>({
    method: 'POST',
    path: () => '/platform/auth/2fa/setup',
  }),
  enable2fa: endpoint<void, PlatformSessionResponse, { code: string }>({ method: 'POST', path: () => '/platform/auth/2fa/enable' }),
  disable2fa: endpoint<void, PlatformSessionResponse, { code: string }>({ method: 'POST', path: () => '/platform/auth/2fa/disable' }),
});

/** Organizations: the overview, the cursor list, one org, and the operator's switches (platform-admin.controller). */
export const platformOrgsEndpoints = defineEndpoints('platformOrgs', {
  overview: endpoint<void, PlatformOverview>({ method: 'GET', path: () => '/platform/overview' }),
  /** ⚠️ `unwrap: 'raw'` — see the file header. */
  list: endpoint<{ search?: string; status?: string; cursor?: string; limit?: number }, PlatformCursorPage<PlatformOrgRow>>({
    method: 'GET',
    path: (q) => withQuery('/platform/orgs', q),
  }),
  detail: endpoint<Id, PlatformOrgDetail>({ method: 'GET', path: (a) => path`/platform/orgs/${a.id}` }),
  extendTrial: endpoint<Id, unknown, { days?: number }>({ method: 'POST', path: (a) => path`/platform/orgs/${a.id}/extend-trial` }),
  endTrial: endpoint<Id, unknown, Empty>({ method: 'POST', path: (a) => path`/platform/orgs/${a.id}/end-trial` }),
  suspend: endpoint<Id, unknown, Empty>({ method: 'POST', path: (a) => path`/platform/orgs/${a.id}/suspend` }),
  reactivate: endpoint<Id, unknown, Empty>({ method: 'POST', path: (a) => path`/platform/orgs/${a.id}/reactivate` }),
  setBillingMode: endpoint<Id, unknown, { mode: BillingMode; invoiceDueDays?: number }>({
    method: 'POST',
    path: (a) => path`/platform/orgs/${a.id}/billing-mode`,
  }),
  setAgreedPrice: endpoint<Id, unknown, { monthlyCents: number; until: string | null; note: string | null }>({
    method: 'POST',
    path: (a) => path`/platform/orgs/${a.id}/agreed-price`,
  }),
  clearAgreedPrice: endpoint<Id, unknown>({ method: 'DELETE', path: (a) => path`/platform/orgs/${a.id}/agreed-price` }),
});

/** Is the platform itself healthy — outbound mail (platform-admin.controller). */
export const platformSystemEndpoints = defineEndpoints('platformSystem', {
  mail: endpoint<void, PlatformMailStatus>({ method: 'GET', path: () => '/platform/mail' }),
});

/** Bills that fell and Stripe syncs that failed (platform-admin.controller). */
export const platformAlertsEndpoints = defineEndpoints('platformAlerts', {
  list: endpoint<void, PlatformBillingAlert[]>({ method: 'GET', path: () => '/platform/billing-alerts' }),
  ack: endpoint<Id, unknown, Empty>({ method: 'POST', path: (a) => path`/platform/billing-alerts/${a.id}/ack` }),
});

/** The price list as code defines it, and Stripe checked against it — read-only (platform-pricing.controller). */
export const platformPricingEndpoints = defineEndpoints('platformPricing', {
  list: endpoint<void, PlatformPriceList>({ method: 'GET', path: () => '/platform/pricing' }),
  stripe: endpoint<void, PlatformStripeStatus>({ method: 'GET', path: () => '/platform/pricing/stripe' }),
});

/** The support inbox (platform-support.controller). */
export const platformSupportEndpoints = defineEndpoints('platformSupport', {
  inbox: endpoint<{ view?: PlatformInboxView }, PlatformTicket[]>({ method: 'GET', path: (q) => withQuery('/platform/support/inbox', q) }),
  ticket: endpoint<Id, PlatformTicket & { messages?: PlatformTicketMessage[] }>({ method: 'GET', path: (a) => path`/platform/support/tickets/${a.id}` }),
  reply: endpoint<Id, unknown, { body: string; isInternalNote: boolean }>({ method: 'POST', path: (a) => path`/platform/support/tickets/${a.id}/messages` }),
  setStatus: endpoint<Id, unknown, { status: string }>({ method: 'POST', path: (a) => path`/platform/support/tickets/${a.id}/status` }),
  /** `{}` self-claims; `{ teamId }` re-routes (null = triage). */
  assign: endpoint<Id, unknown, { teamId?: string | null }>({ method: 'POST', path: (a) => path`/platform/support/tickets/${a.id}/assign` }),
  markRead: endpoint<Id, unknown, Empty>({ method: 'POST', path: (a) => path`/platform/support/tickets/${a.id}/read` }),
});

type TeamId = { teamId: string };

/** Support teams, their members, routing rules and pinned orgs (platform-support-teams.controller). */
export const platformSupportTeamsEndpoints = defineEndpoints('platformSupportTeams', {
  staff: endpoint<void, PlatformTeamStaff[]>({ method: 'GET', path: () => '/platform/support/teams/staff' }),
  list: endpoint<void, PlatformTeam[]>({ method: 'GET', path: () => '/platform/support/teams' }),
  create: endpoint<void, PlatformTeam, { name: string }>({ method: 'POST', path: () => '/platform/support/teams' }),
  update: endpoint<TeamId, PlatformTeam, Partial<Pick<PlatformTeam, 'name' | 'color' | 'description' | 'isActive'>>>({
    method: 'PUT',
    path: (a) => path`/platform/support/teams/${a.teamId}`,
  }),
  remove: endpoint<TeamId, unknown>({ method: 'DELETE', path: (a) => path`/platform/support/teams/${a.teamId}` }),
  addMember: endpoint<TeamId, unknown, { platformUserId: string; teamRole: 'MANAGER' | 'AGENT' }>({
    method: 'POST',
    path: (a) => path`/platform/support/teams/${a.teamId}/members`,
  }),
  removeMember: endpoint<TeamId & { platformUserId: string }, unknown>({
    method: 'DELETE',
    path: (a) => path`/platform/support/teams/${a.teamId}/members/${a.platformUserId}`,
  }),
  upsertRule: endpoint<TeamId, unknown, Partial<PlatformRoutingRule> & { conditions: PlatformRoutingRule['conditions'] }>({
    method: 'POST',
    path: (a) => path`/platform/support/teams/${a.teamId}/rules`,
  }),
  deleteRule: endpoint<{ ruleId: string }, unknown>({ method: 'DELETE', path: (a) => path`/platform/support/teams/rules/${a.ruleId}` }),
  pinnedOrgs: endpoint<TeamId, PlatformPinnedOrg[]>({ method: 'GET', path: (a) => path`/platform/support/teams/${a.teamId}/pinned-orgs` }),
  pinOrg: endpoint<void, unknown, { organizationId: string; teamId: string | null }>({ method: 'POST', path: () => '/platform/support/teams/pin-org' }),
});

/** The workflow template library every tenant copies from (platform-library.controller). */
export const platformLibraryEndpoints = defineEndpoints('platformLibrary', {
  list: endpoint<void, PlatformTemplate[]>({ method: 'GET', path: () => '/platform/library/templates' }),
  create: endpoint<void, PlatformTemplate, Record<string, unknown>>({ method: 'POST', path: () => '/platform/library/templates' }),
  update: endpoint<Id, PlatformTemplate, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/platform/library/templates/${a.id}` }),
  publish: endpoint<Id, unknown, { isPublished: boolean }>({ method: 'PATCH', path: (a) => path`/platform/library/templates/${a.id}/publish` }),
  remove: endpoint<Id, unknown>({ method: 'DELETE', path: (a) => path`/platform/library/templates/${a.id}` }),
  importFromOrg: endpoint<{ workflowId: string }, unknown, Empty>({
    method: 'POST',
    path: (a) => path`/platform/library/templates/import/${a.workflowId}`,
  }),
});

/** The console's own staff (platform-auth.controller, `managePlatformUsers`). */
export const platformStaffEndpoints = defineEndpoints('platformStaff', {
  list: endpoint<void, PlatformStaffUser[]>({ method: 'GET', path: () => '/platform/users' }),
  create: endpoint<void, PlatformStaffUser, { email: string; firstName: string; lastName: string; role: string; password: string }>({
    method: 'POST',
    path: () => '/platform/users',
  }),
  update: endpoint<Id, PlatformStaffUser, { role?: string; isActive?: boolean }>({ method: 'PATCH', path: (a) => path`/platform/users/${a.id}` }),
  resetPassword: endpoint<Id, unknown, { password: string }>({ method: 'POST', path: (a) => path`/platform/users/${a.id}/reset-password` }),
  reset2fa: endpoint<Id, unknown, Empty>({ method: 'POST', path: (a) => path`/platform/users/${a.id}/reset-2fa` }),
});

/** Who did what on this console (platform-admin.controller, `viewPlatformAudit`). */
export const platformAuditEndpoints = defineEndpoints('platformAudit', {
  /** ⚠️ `unwrap: 'raw'` — see the file header. */
  list: endpoint<{ cursor?: string; limit?: number; actorId?: string; organizationId?: string }, PlatformCursorPage<PlatformAuditRow>>({
    method: 'GET',
    path: (q) => withQuery('/platform/audit', q),
  }),
});

/** The console's whole table — `platformEndpoints.orgs.detail`, and what its tests walk. */
export const platformEndpoints = {
  auth: platformAuthEndpoints,
  orgs: platformOrgsEndpoints,
  system: platformSystemEndpoints,
  alerts: platformAlertsEndpoints,
  pricing: platformPricingEndpoints,
  support: platformSupportEndpoints,
  supportTeams: platformSupportTeamsEndpoints,
  library: platformLibraryEndpoints,
  staff: platformStaffEndpoints,
  audit: platformAuditEndpoints,
} as const;

export type PlatformEndpoints = typeof platformEndpoints;
