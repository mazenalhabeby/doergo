/**
 * The organization: workspaces (`/locations` — "spaces" in the product), the
 * member directory, roles, settings, invitations, join requests and onboarding.
 * Gateway: modules/locations, organizations, invitations, join-requests, onboarding.
 */
import type { AcceptInvitationInput, CompanyLocation, CreateInvitationInput, Invitation, InvitationValidation, JoinRequest, OnboardingStatus, OrgCodeValidation, User } from '../../types';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';
import type { Colleague, LocationAssignment, OrgMember } from '../types';
import type { SessionTokens } from './platform';

type Id = { id: string };

export const locationsEndpoints = defineEndpoints('locations', {
  /** Default hides CUSTOMER spaces from work pickers; `kind: 'all'` for the directory. No `search` on the server. */
  list: endpoint<{ page?: number; limit?: number; includeInactive?: boolean; kind?: string } | void, CompanyLocation[]>({
    method: 'GET',
    path: (q) => withQuery('/locations', q || undefined),
    keep: true,
  }),
  get: endpoint<Id, CompanyLocation>({ method: 'GET', path: (a) => path`/locations/${a.id}`, keep: true }),
  create: endpoint<void, CompanyLocation, Record<string, unknown>>({ method: 'POST', path: () => '/locations' }),
  update: endpoint<Id, CompanyLocation, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/locations/${a.id}` }),
  /** Deactivate (soft). */
  archive: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/locations/${a.id}` }),
  removePermanently: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/locations/${a.id}/permanent` }),
  /** Make this the organization's default workspace (one transaction). */
  setDefault: endpoint<Id, CompanyLocation>({ method: 'POST', path: (a) => path`/locations/${a.id}/default` }),
  modules: endpoint<Id, unknown>({ method: 'GET', path: (a) => path`/locations/${a.id}/modules`, keep: true }),
  members: endpoint<Id, LocationAssignment[]>({ method: 'GET', path: (a) => path`/locations/${a.id}/members`, keep: true }),
  /** Several workspaces' rosters in one read (`ids` joined with commas). */
  rosters: endpoint<{ ids: string[] }, LocationAssignment[]>({ method: 'GET', path: (q) => withQuery('/locations/rosters', { ids: q.ids }), keep: true }),
  assignMember: endpoint<Id, LocationAssignment, { userId: string; isPrimary?: boolean; [k: string]: unknown }>({ method: 'POST', path: (a) => path`/locations/${a.id}/members` }),
  updateMember: endpoint<Id & { assignmentId: string }, LocationAssignment, Record<string, unknown>>({
    method: 'PATCH',
    path: (a) => path`/locations/${a.id}/members/${a.assignmentId}`,
  }),
  removeMember: endpoint<Id & { assignmentId: string }, void>({ method: 'DELETE', path: (a) => path`/locations/${a.id}/members/${a.assignmentId}` }),
  /** The caller's colleagues across their workspaces. */
  team: endpoint<void, Colleague[]>({ method: 'GET', path: () => '/locations/team', keep: true }),
});

export interface MembersQuery {
  search?: string;
  role?: string;
  page?: number;
  limit?: number;
  managersOnly?: boolean;
  /** Joined with commas on the wire. */
  includeIds?: string[];
  excludeId?: string;
  lite?: boolean;
}

export const organizationsEndpoints = defineEndpoints('organizations', {
  members: endpoint<MembersQuery | void, OrgMember[]>({ method: 'GET', path: (q) => withQuery('/organizations/members', q || undefined), keep: true }),
  member: endpoint<Id, OrgMember>({ method: 'GET', path: (a) => path`/organizations/members/${a.id}`, keep: true }),
  updateMember: endpoint<Id, OrgMember, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/organizations/members/${a.id}` }),
  removeMember: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/organizations/members/${a.id}` }),
  resetMemberPassword: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/organizations/members/${a.id}/reset-password` }),
  /** The worker's statement — hours per workspace × their cost rate (canViewLabourCost). */
  statement: endpoint<Id & { from?: string; to?: string }, unknown>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/organizations/members/${id}/statement`, q),
  }),
  watchers: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/organizations/members/${a.id}/watchers` }),
  setWatchers: endpoint<Id, unknown, { watcherIds: string[] }>({ method: 'PUT', path: (a) => path`/organizations/members/${a.id}/watchers` }),
  /** The people a member may contact (the Managers group). */
  contacts: endpoint<void, Colleague[]>({ method: 'GET', path: () => '/organizations/contacts', keep: true }),
  transferOwnership: endpoint<void, void, { newOwnerId: string }>({ method: 'POST', path: () => '/organizations/transfer-ownership' }),

  roles: endpoint<{ scope?: 'org' | 'space' } | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/organizations/roles', q || undefined) }),
  createRole: endpoint<void, unknown, { name: string; description?: string; color?: string; permissions?: Record<string, boolean> }>({
    method: 'POST',
    path: () => '/organizations/roles',
  }),
  updateRole: endpoint<Id, unknown, { name?: string; description?: string; color?: string; permissions?: Record<string, boolean> }>({
    method: 'PATCH',
    path: (a) => path`/organizations/roles/${a.id}`,
  }),
  removeRole: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/organizations/roles/${a.id}` }),

  joinCode: endpoint<void, { hasJoinCode: boolean; joinPolicy: string; joinCode?: string | null }>({ method: 'GET', path: () => '/organizations/join-code', keep: true }),
  regenerateJoinCode: endpoint<void, { code: string }>({ method: 'POST', path: () => '/organizations/regenerate-join-code' }),
  updateSettings: endpoint<void, unknown, { joinPolicy: string }>({ method: 'PATCH', path: () => '/organizations/settings' }),
  updateLeavePolicy: endpoint<void, unknown, { defaultLeaveAllowance: number }>({ method: 'PATCH', path: () => '/organizations/leave-policy' }),
  profile: endpoint<void, unknown>({ method: 'GET', path: () => '/organizations/profile' }),
  updateProfile: endpoint<void, unknown, Record<string, unknown>>({ method: 'PATCH', path: () => '/organizations/profile' }),
  updateNotificationPrefs: endpoint<void, unknown, Record<string, unknown>>({ method: 'PATCH', path: () => '/organizations/notification-prefs' }),
  auditLogs: endpoint<Record<string, string | number | undefined> | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/organizations/audit-logs', q || undefined) }),
});

export const invitationsEndpoints = defineEndpoints('invitations', {
  list: endpoint<{ status?: string; page?: number; limit?: number } | void, Invitation[]>({ method: 'GET', path: (q) => withQuery('/invitations', q || undefined), keep: true }),
  create: endpoint<void, { code: string; invitation: Invitation }, CreateInvitationInput>({ method: 'POST', path: () => '/invitations' }),
  revoke: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/invitations/${a.id}` }),
  /** ⚠️ The code is a bearer credential AND a path segment: encoded, and never logged by the core. */
  validate: endpoint<{ code: string }, InvitationValidation>({ method: 'GET', path: (a) => path`/invitations/validate/${a.code}`, public: true, keep: false }),
  accept: endpoint<void, SessionTokens & { user: User }, AcceptInvitationInput>({ method: 'POST', path: () => '/invitations/accept', public: true }),
});

export const joinRequestsEndpoints = defineEndpoints('joinRequests', {
  list: endpoint<{ status?: string; page?: number; limit?: number } | void, JoinRequest[]>({ method: 'GET', path: (q) => withQuery('/join-requests', q || undefined), keep: true }),
  approve: endpoint<Id, unknown, { role?: string; memberRoleId?: string | null; [k: string]: unknown }>({ method: 'PATCH', path: (a) => path`/join-requests/${a.id}/approve` }),
  reject: endpoint<Id, unknown, { reason?: string }>({ method: 'PATCH', path: (a) => path`/join-requests/${a.id}/reject` }),
});

/** A signed-in account with no organization yet (JWT + SkipOnboarding on the gateway). */
export const onboardingEndpoints = defineEndpoints('onboarding', {
  status: endpoint<void, OnboardingStatus>({ method: 'GET', path: () => '/onboarding/status', keep: false }),
  createOrg: endpoint<void, { organization: { id: string; name: string }; joinCode: string; user: User }, { name: string; address?: string; industry?: string; firstSpaceName?: string }>({
    method: 'POST',
    path: () => '/onboarding/create-org',
  }),
  validateOrgCode: endpoint<{ code: string }, OrgCodeValidation>({ method: 'GET', path: (a) => path`/onboarding/validate-org-code/${a.code}`, keep: false }),
  joinByCode: endpoint<void, unknown, { orgCode: string; message?: string }>({ method: 'POST', path: () => '/onboarding/join-by-code' }),
  acceptInvitation: endpoint<void, { user: User }, { code: string }>({ method: 'POST', path: () => '/onboarding/accept-invitation' }),
  cancelJoinRequest: endpoint<Id, unknown>({ method: 'DELETE', path: (a) => path`/onboarding/join-requests/${a.id}` }),
});

/** What `GET /app/version` answers (gateway app-version.controller). */
export interface AppVersionInfo {
  minimum?: string | null;
  latest?: string | null;
  downloads?: { android?: string | null; ios?: string | null };
  /** A release note in the asked language; its shape is the phone's to read. */
  whatsNew?: unknown;
}

/** The app itself — which version is current and which is required (the phone's update gate). Public: asked before sign-in. */
export const appEndpoints = defineEndpoints('app', {
  version: endpoint<{ lang?: string } | void, AppVersionInfo | null>({
    method: 'GET',
    path: (q) => withQuery('/app/version', q || undefined),
    public: true,
    keep: false,
  }),
});
