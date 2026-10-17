/**
 * Every call the console makes, grouped by area, as the screens like to call
 * them. Each one is `api.call(platformEndpoints.<domain>.<key>, args, { body })`
 * — the route, its method and the encoding of its parameters live ONCE in the
 * shared table (packages/shared/src/http/endpoints/platform-admin.ts). Nothing
 * here builds a URL.
 */
import { platformEndpoints as P } from '@hbcfield/shared/client';
import { api } from './client';
import type {
  AuditRow, BillingMode, InboxView, OrgRow, Page, PinnedOrg, Team, TRule,
} from './types';

type Sig = { signal?: AbortSignal };

/** A cursor page, unwrapped to what the screens read. */
function toPage<T>(raw: { data?: T[] | null; nextCursor?: string | null } | null): Page<T> {
  return { data: raw?.data ?? [], nextCursor: raw?.nextCursor ?? null };
}

export const authApi = {
  /** `auth: false` comes from the definition (public): a 401 here is a wrong password, not an ended session. */
  login: (body: { email: string; password: string; code?: string }) => api.call(P.auth.login, undefined, { body }),
  me: () => api.call(P.auth.me),
  logout: () => api.call(P.auth.logout, undefined, { body: {} }),
  refresh: () => api.call(P.auth.refresh, undefined, { body: {} }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.call(P.auth.changePassword, undefined, { body: { currentPassword, newPassword } }),
  /** While 2FA is on, `code` (a current one) is required to re-key. */
  setup2fa: (code?: string) => api.call(P.auth.setup2fa, undefined, { body: code ? { code } : {} }),
  enable2fa: (code: string) => api.call(P.auth.enable2fa, undefined, { body: { code } }),
  disable2fa: (code: string) => api.call(P.auth.disable2fa, undefined, { body: { code } }),
};

export const orgsApi = {
  overview: (o: Sig = {}) => api.call(P.orgs.overview, undefined, o),
  list: async (p: { search?: string; status?: string; cursor?: string | null }, o: Sig = {}): Promise<Page<OrgRow>> =>
    toPage(
      await api.call(
        P.orgs.list,
        { search: p.search, status: p.status === 'all' ? undefined : p.status, cursor: p.cursor ?? undefined },
        { ...o, unwrap: 'raw' },
      ),
    ),
  detail: (id: string, o: Sig = {}) => api.call(P.orgs.detail, { id }, o),
  extendTrial: (id: string, days = 14) => api.call(P.orgs.extendTrial, { id }, { body: { days } }),
  endTrial: (id: string) => api.call(P.orgs.endTrial, { id }, { body: {} }),
  suspend: (id: string) => api.call(P.orgs.suspend, { id }, { body: {} }),
  reactivate: (id: string) => api.call(P.orgs.reactivate, { id }, { body: {} }),
  setBillingMode: (id: string, mode: BillingMode, invoiceDueDays?: number) =>
    api.call(P.orgs.setBillingMode, { id }, { body: { mode, ...(invoiceDueDays ? { invoiceDueDays } : {}) } }),
  setAgreedPrice: (id: string, body: { monthlyCents: number; until: string | null; note: string | null }) =>
    api.call(P.orgs.setAgreedPrice, { id }, { body }),
  clearAgreedPrice: (id: string) => api.call(P.orgs.clearAgreedPrice, { id }),
};

export const billingApi = {
  alerts: () => api.call(P.alerts.list),
  ack: (id: string) => api.call(P.alerts.ack, { id }, { body: {} }),
};

export const systemApi = {
  mail: () => api.call(P.system.mail),
};

export const staffApi = {
  list: () => api.call(P.staff.list),
  create: (body: { email: string; firstName: string; lastName: string; role: string; password: string }) =>
    api.call(P.staff.create, undefined, { body }),
  update: (id: string, body: { role?: string; isActive?: boolean }) => api.call(P.staff.update, { id }, { body }),
  reset2fa: (id: string) => api.call(P.staff.reset2fa, { id }, { body: {} }),
};

export const pricingApi = {
  list: () => api.call(P.pricing.list),
  stripe: () => api.call(P.pricing.stripe),
};

export const supportApi = {
  inbox: (view: InboxView, o: Sig = {}) => api.call(P.support.inbox, { view }, o),
  thread: (id: string, o: Sig = {}) => api.call(P.support.ticket, { id }, o),
  reply: (id: string, body: string, isInternalNote: boolean) => api.call(P.support.reply, { id }, { body: { body, isInternalNote } }),
  setStatus: (id: string, status: string) => api.call(P.support.setStatus, { id }, { body: { status } }),
  /** `{}` self-claims; `{ teamId }` re-routes (null = triage). */
  assign: (id: string, body: { teamId?: string | null }) => api.call(P.support.assign, { id }, { body }),
  markRead: (id: string) => api.call(P.support.markRead, { id }, { body: {} }),
};

export const teamsApi = {
  staff: () => api.call(P.supportTeams.staff),
  list: () => api.call(P.supportTeams.list),
  create: (name: string) => api.call(P.supportTeams.create, undefined, { body: { name } }),
  update: (teamId: string, patch: Partial<Pick<Team, 'name' | 'color' | 'description' | 'isActive'>>) =>
    api.call(P.supportTeams.update, { teamId }, { body: patch }),
  remove: (teamId: string) => api.call(P.supportTeams.remove, { teamId }),
  addMember: (teamId: string, platformUserId: string, teamRole: 'MANAGER' | 'AGENT') =>
    api.call(P.supportTeams.addMember, { teamId }, { body: { platformUserId, teamRole } }),
  removeMember: (teamId: string, platformUserId: string) => api.call(P.supportTeams.removeMember, { teamId, platformUserId }),
  upsertRule: (teamId: string, rule: Partial<TRule> & { conditions: TRule['conditions'] }) =>
    api.call(P.supportTeams.upsertRule, { teamId }, { body: rule }),
  deleteRule: (ruleId: string) => api.call(P.supportTeams.deleteRule, { ruleId }),
  pinnedOrgs: (teamId: string): Promise<PinnedOrg[]> => api.call(P.supportTeams.pinnedOrgs, { teamId }),
  pinOrg: (organizationId: string, teamId: string | null) => api.call(
    P.supportTeams.pinOrg,
    undefined,
    { body: { organizationId, teamId } }),
};

export const libraryApi = {
  list: () => api.call(P.library.list),
  save: (id: string | null, body: Record<string, unknown>) =>
    id ? api.call(P.library.update, { id }, { body }) : api.call(P.library.create, undefined, { body }),
  publish: (id: string, isPublished: boolean) => api.call(P.library.publish, { id }, { body: { isPublished } }),
  remove: (id: string) => api.call(P.library.remove, { id }),
  importFromOrg: (workflowId: string) => api.call(P.library.importFromOrg, { workflowId }, { body: {} }),
};

export const auditApi = {
  list: async (p: { cursor?: string | null; organizationId?: string }, o: Sig = {}): Promise<Page<AuditRow>> =>
    toPage(
      await api.call(
        P.audit.list,
        { cursor: p.cursor ?? undefined, organizationId: p.organizationId, limit: 50 },
        { ...o, unwrap: 'raw' },
      ),
    ),
};
