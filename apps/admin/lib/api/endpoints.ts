/**
 * Every call the console makes, typed and grouped by area. Screens call these;
 * nothing else builds a URL. Parameters go through `path` (encoded) and `query`.
 */
import { path, query, request, requestPage } from './client';
import type {
  AuditRow, BillingAlertRow, BillingMode, InboxView, LoginResponse, MailStatus, Me, Msg, OrgDetail, OrgRow, Overview,
  PinnedOrg, PriceList, SessionResponse, StaffUser, StripeStatus, Team, Ticket, TRule, TStaff, Tpl,
} from './types';

type Sig = { signal?: AbortSignal };

export const authApi = {
  login: (body: { email: string; password: string; code?: string }) =>
    request<LoginResponse>('/platform/auth/login', { body, session: false }),
  me: () => request<Me>('/platform/auth/me'),
  logout: () => request<{ signedOut: boolean }>('/platform/auth/logout', { body: {} }),
  refresh: () => request<SessionResponse>('/platform/auth/refresh', { body: {} }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<SessionResponse & { id: string }>('/platform/auth/change-password', { body: { currentPassword, newPassword } }),
  /** While 2FA is on, `code` (a current one) is required to re-key. */
  setup2fa: (code?: string) =>
    request<SessionResponse & { secret: string; otpauthUri: string }>('/platform/auth/2fa/setup', { body: code ? { code } : {} }),
  enable2fa: (code: string) => request<SessionResponse>('/platform/auth/2fa/enable', { body: { code } }),
  disable2fa: (code: string) => request<SessionResponse>('/platform/auth/2fa/disable', { body: { code } }),
};

export const orgsApi = {
  overview: (o: Sig = {}) => request<Overview>('/platform/overview', o),
  list: (p: { search?: string; status?: string; cursor?: string | null }, o: Sig = {}) =>
    requestPage<OrgRow>(`/platform/orgs${query({ search: p.search, status: p.status === 'all' ? undefined : p.status, cursor: p.cursor ?? undefined })}`, o),
  detail: (id: string, o: Sig = {}) => request<OrgDetail>(path`/platform/orgs/${id}`, o),
  extendTrial: (id: string, days = 14) => request(path`/platform/orgs/${id}/extend-trial`, { body: { days } }),
  endTrial: (id: string) => request(path`/platform/orgs/${id}/end-trial`, { body: {} }),
  suspend: (id: string) => request(path`/platform/orgs/${id}/suspend`, { body: {} }),
  reactivate: (id: string) => request(path`/platform/orgs/${id}/reactivate`, { body: {} }),
  setBillingMode: (id: string, mode: BillingMode, invoiceDueDays?: number) =>
    request(path`/platform/orgs/${id}/billing-mode`, { body: { mode, ...(invoiceDueDays ? { invoiceDueDays } : {}) } }),
  setAgreedPrice: (id: string, body: { monthlyCents: number; until: string | null; note: string | null }) =>
    request(path`/platform/orgs/${id}/agreed-price`, { body }),
  clearAgreedPrice: (id: string) => request(path`/platform/orgs/${id}/agreed-price`, { method: 'DELETE' }),
};

export const billingApi = {
  alerts: () => request<BillingAlertRow[]>('/platform/billing-alerts'),
  ack: (id: string) => request(path`/platform/billing-alerts/${id}/ack`, { body: {} }),
};

export const systemApi = {
  mail: () => request<MailStatus>('/platform/mail'),
};

export const staffApi = {
  list: () => request<StaffUser[]>('/platform/users'),
  create: (body: { email: string; firstName: string; lastName: string; role: string; password: string }) =>
    request<StaffUser>('/platform/users', { body }),
  update: (id: string, body: { role?: string; isActive?: boolean }) =>
    request<StaffUser>(path`/platform/users/${id}`, { method: 'PATCH', body }),
  reset2fa: (id: string) => request(path`/platform/users/${id}/reset-2fa`, { body: {} }),
};

export const pricingApi = {
  list: () => request<PriceList>('/platform/pricing'),
  stripe: () => request<StripeStatus>('/platform/pricing/stripe'),
};

export const supportApi = {
  inbox: (view: InboxView, o: Sig = {}) => request<Ticket[]>(`/platform/support/inbox${query({ view })}`, o),
  thread: (id: string, o: Sig = {}) => request<Ticket & { messages?: Msg[] }>(path`/platform/support/tickets/${id}`, o),
  reply: (id: string, body: string, isInternalNote: boolean) =>
    request(path`/platform/support/tickets/${id}/messages`, { body: { body, isInternalNote } }),
  setStatus: (id: string, status: string) => request(path`/platform/support/tickets/${id}/status`, { body: { status } }),
  /** `{}` self-claims; `{ teamId }` re-routes (null = triage). */
  assign: (id: string, body: { teamId?: string | null }) => request(path`/platform/support/tickets/${id}/assign`, { body }),
  markRead: (id: string) => request(path`/platform/support/tickets/${id}/read`, { body: {} }),
};

export const teamsApi = {
  staff: () => request<TStaff[]>('/platform/support/teams/staff'),
  list: () => request<Team[]>('/platform/support/teams'),
  create: (name: string) => request<Team>('/platform/support/teams', { body: { name } }),
  update: (teamId: string, patch: Partial<Pick<Team, 'name' | 'color' | 'description' | 'isActive'>>) =>
    request<Team>(path`/platform/support/teams/${teamId}`, { method: 'PUT', body: patch }),
  remove: (teamId: string) => request(path`/platform/support/teams/${teamId}`, { method: 'DELETE' }),
  addMember: (teamId: string, platformUserId: string, teamRole: 'MANAGER' | 'AGENT') =>
    request(path`/platform/support/teams/${teamId}/members`, { body: { platformUserId, teamRole } }),
  removeMember: (teamId: string, platformUserId: string) =>
    request(path`/platform/support/teams/${teamId}/members/${platformUserId}`, { method: 'DELETE' }),
  upsertRule: (teamId: string, rule: Partial<TRule> & { conditions: TRule['conditions'] }) =>
    request(path`/platform/support/teams/${teamId}/rules`, { body: rule }),
  deleteRule: (ruleId: string) => request(path`/platform/support/teams/rules/${ruleId}`, { method: 'DELETE' }),
  pinnedOrgs: (teamId: string) => request<PinnedOrg[]>(path`/platform/support/teams/${teamId}/pinned-orgs`),
  pinOrg: (organizationId: string, teamId: string | null) =>
    request('/platform/support/teams/pin-org', { body: { organizationId, teamId } }),
};

export const libraryApi = {
  list: () => request<Tpl[]>('/platform/library/templates'),
  save: (id: string | null, body: Record<string, unknown>) =>
    id
      ? request<Tpl>(path`/platform/library/templates/${id}`, { method: 'PATCH', body })
      : request<Tpl>('/platform/library/templates', { body }),
  publish: (id: string, isPublished: boolean) =>
    request(path`/platform/library/templates/${id}/publish`, { method: 'PATCH', body: { isPublished } }),
  remove: (id: string) => request(path`/platform/library/templates/${id}`, { method: 'DELETE' }),
  importFromOrg: (workflowId: string) => request(path`/platform/library/templates/import/${workflowId}`, { body: {} }),
};

export const auditApi = {
  list: (p: { cursor?: string | null; organizationId?: string }, o: Sig = {}) =>
    requestPage<AuditRow>(`/platform/audit${query({ cursor: p.cursor ?? undefined, organizationId: p.organizationId, limit: 50 })}`, o),
};
