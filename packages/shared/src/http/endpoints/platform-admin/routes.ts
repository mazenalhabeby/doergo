/** Every `/platform/*` route the console calls, by area. */
import { defineEndpoints, endpoint } from '../../core/define';
import { path, withQuery } from '../../core/path';
import type { BillingMode } from '../../../billing/types';
import type {
  PlatformAuditRow,
  PlatformInboxView,
  PlatformPinnedOrg,
  PlatformRoutingRule,
  PlatformTeam,
  PlatformTeamStaff,
  PlatformTemplate,
  PlatformTicket,
  PlatformTicketMessage,
} from './support-types';
import type {
  Empty,
  Id,
  PlatformBillingAlert,
  PlatformCursorPage,
  PlatformLoginResponse,
  PlatformMailStatus,
  PlatformMe,
  PlatformOrgDetail,
  PlatformOrgRow,
  PlatformOverview,
  PlatformPriceList,
  PlatformSessionResponse,
  PlatformStaffUser,
  PlatformStripeStatus,
} from './types';

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
  changePassword: endpoint<
    void,
    PlatformSessionResponse & { id: string },
    { currentPassword: string; newPassword: string }
  >({
    method: 'POST',
    path: () => '/platform/auth/change-password',
  }),
  /** While 2FA is on, `code` (a current one) is required to re-key. */
  setup2fa: endpoint<void, PlatformSessionResponse & { secret: string; otpauthUri: string }, { code?: string }>({
    method: 'POST',
    path: () => '/platform/auth/2fa/setup',
  }),
  enable2fa: endpoint<void, PlatformSessionResponse, { code: string }>({
    method: 'POST',
    path: () => '/platform/auth/2fa/enable',
  }),
  disable2fa: endpoint<void, PlatformSessionResponse, { code: string }>({
    method: 'POST',
    path: () => '/platform/auth/2fa/disable',
  }),
});

/** Organizations: the overview, the cursor list, one org, and the operator's switches (platform-admin.controller). */
export const platformOrgsEndpoints = defineEndpoints('platformOrgs', {
  overview: endpoint<void, PlatformOverview>({ method: 'GET', path: () => '/platform/overview' }),
  /** ⚠️ `unwrap: 'raw'` — see the file header. */
  list: endpoint<
    { search?: string; status?: string; cursor?: string; limit?: number },
    PlatformCursorPage<PlatformOrgRow>
  >({
    method: 'GET',
    path: (q) => withQuery('/platform/orgs', q),
  }),
  detail: endpoint<Id, PlatformOrgDetail>({ method: 'GET', path: (a) => path`/platform/orgs/${a.id}` }),
  extendTrial: endpoint<Id, unknown, { days?: number }>({
    method: 'POST',
    path: (a) => path`/platform/orgs/${a.id}/extend-trial`,
  }),
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
  inbox: endpoint<{ view?: PlatformInboxView }, PlatformTicket[]>({
    method: 'GET',
    path: (q) => withQuery('/platform/support/inbox', q),
  }),
  ticket: endpoint<Id, PlatformTicket & { messages?: PlatformTicketMessage[] }>({
    method: 'GET',
    path: (a) => path`/platform/support/tickets/${a.id}`,
  }),
  reply: endpoint<Id, unknown, { body: string; isInternalNote: boolean }>({
    method: 'POST',
    path: (a) => path`/platform/support/tickets/${a.id}/messages`,
  }),
  setStatus: endpoint<Id, unknown, { status: string }>({
    method: 'POST',
    path: (a) => path`/platform/support/tickets/${a.id}/status`,
  }),
  /** `{}` self-claims; `{ teamId }` re-routes (null = triage). */
  assign: endpoint<Id, unknown, { teamId?: string | null }>({
    method: 'POST',
    path: (a) => path`/platform/support/tickets/${a.id}/assign`,
  }),
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
  upsertRule: endpoint<
    TeamId,
    unknown,
    Partial<PlatformRoutingRule> & { conditions: PlatformRoutingRule['conditions'] }
  >({
    method: 'POST',
    path: (a) => path`/platform/support/teams/${a.teamId}/rules`,
  }),
  deleteRule: endpoint<{ ruleId: string }, unknown>({
    method: 'DELETE',
    path: (a) => path`/platform/support/teams/rules/${a.ruleId}`,
  }),
  pinnedOrgs: endpoint<TeamId, PlatformPinnedOrg[]>({
    method: 'GET',
    path: (a) => path`/platform/support/teams/${a.teamId}/pinned-orgs`,
  }),
  pinOrg: endpoint<void, unknown, { organizationId: string; teamId: string | null }>({
    method: 'POST',
    path: () => '/platform/support/teams/pin-org',
  }),
});

/** The workflow template library every tenant copies from (platform-library.controller). */
export const platformLibraryEndpoints = defineEndpoints('platformLibrary', {
  list: endpoint<void, PlatformTemplate[]>({ method: 'GET', path: () => '/platform/library/templates' }),
  create: endpoint<void, PlatformTemplate, Record<string, unknown>>({
    method: 'POST',
    path: () => '/platform/library/templates',
  }),
  update: endpoint<Id, PlatformTemplate, Record<string, unknown>>({
    method: 'PATCH',
    path: (a) => path`/platform/library/templates/${a.id}`,
  }),
  publish: endpoint<Id, unknown, { isPublished: boolean }>({
    method: 'PATCH',
    path: (a) => path`/platform/library/templates/${a.id}/publish`,
  }),
  remove: endpoint<Id, unknown>({ method: 'DELETE', path: (a) => path`/platform/library/templates/${a.id}` }),
  importFromOrg: endpoint<{ workflowId: string }, unknown, Empty>({
    method: 'POST',
    path: (a) => path`/platform/library/templates/import/${a.workflowId}`,
  }),
});

/** The console's own staff (platform-auth.controller, `managePlatformUsers`). */
export const platformStaffEndpoints = defineEndpoints('platformStaff', {
  list: endpoint<void, PlatformStaffUser[]>({ method: 'GET', path: () => '/platform/users' }),
  create: endpoint<
    void,
    PlatformStaffUser,
    { email: string; firstName: string; lastName: string; role: string; password: string }
  >({
    method: 'POST',
    path: () => '/platform/users',
  }),
  update: endpoint<Id, PlatformStaffUser, { role?: string; isActive?: boolean }>({
    method: 'PATCH',
    path: (a) => path`/platform/users/${a.id}`,
  }),
  resetPassword: endpoint<Id, unknown, { password: string }>({
    method: 'POST',
    path: (a) => path`/platform/users/${a.id}/reset-password`,
  }),
  reset2fa: endpoint<Id, unknown, Empty>({ method: 'POST', path: (a) => path`/platform/users/${a.id}/reset-2fa` }),
});

/** Who did what on this console (platform-admin.controller, `viewPlatformAudit`). */
export const platformAuditEndpoints = defineEndpoints('platformAudit', {
  /** ⚠️ `unwrap: 'raw'` — see the file header. */
  list: endpoint<
    { cursor?: string; limit?: number; actorId?: string; organizationId?: string },
    PlatformCursorPage<PlatformAuditRow>
  >({
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
