/**
 * Admin API — endpoints for admin management features on mobile
 * Join requests, members, invitations, organization settings
 */
import { call, E } from './client';
import type { OrgMember, Colleague } from '@hbcfield/shared/client';

export type { OrgMember, Colleague };

// ============================================================================
// TYPES
// ============================================================================

export interface Invitation {
  id: string;
  targetRole: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  createdAt: string;
  workMode?: string;
  specialty?: string;
  maxDailyJobs?: number;
  createdBy?: { id: string; firstName: string; lastName: string };
  acceptedBy?: { id: string; firstName: string; lastName: string };
  /** The code itself — kept so it can be shared again (see CLAUDE.md §3.4). */
  code?: string | null;
  position?: string | null;
  spaceId?: string | null;
  isExternal?: boolean;
  usedAt?: string | null;
  acceptedById?: string | null;
}

export interface CreateInvitationInput {
  targetRole: string;
  expiresInHours?: number;
  position?: string;
  workMode?: string;
  specialty?: string;
  maxDailyJobs?: number;
  /** Pre-assigned space (CompanyLocation id) — user is assigned to it on accept. */
  spaceId?: string;
}

// ============================================================================
// MEMBERS API
// ============================================================================

/** The server's largest page, and a ceiling so a misbehaving answer cannot loop forever (5,000 people). */
const MEMBER_PAGE = 200;
const MEMBER_PAGES_MAX = 25;

export const membersApi = {
  /**
   * EVERY member. The server pages (10 by default, at most 200), and asking with
   * no page made Manage → Members stop at the first 10 people with an "All 10"
   * chip to match. Pages of 200 are read until one comes back short — one
   * request for almost every organization.
   */
  list: async (): Promise<OrgMember[]> => {
    const all: OrgMember[] = [];
    for (let page = 1; page <= MEMBER_PAGES_MAX; page++) {
      const result = await call(E.organizations.members, { page, limit: MEMBER_PAGE });
      const rows: OrgMember[] = Array.isArray(result) ? result : result?.data || result?.members || [];
      all.push(...rows);
      if (rows.length < MEMBER_PAGE) break;
    }
    return all;
  },

  /**
   * Give a member one of the organization's roles (or none).
   *
   * ⚠️ THE ONE GRANT PATH. `PATCH /organizations/members/:id` — the route the web
   * uses — enforces the ceiling: a role granting more than the caller holds is
   * refused. The phone's old `/members/:id/role` named a route that no longer
   * exists; a second grant path would be a second place to forget the ceiling.
   */
  setRole: async (id: string, memberRoleId: string | null): Promise<void> => {
    await call(E.organizations.updateMember, { id }, { body: { memberRoleId } });
  },

  remove: async (id: string): Promise<void> => {
    await call(E.organizations.removeMember, { id });
  },
};

// ============================================================================
// INVITATIONS API (admin)
// ============================================================================

export const adminInvitationsApi = {
  list: async (): Promise<Invitation[]> => {
    const result = await call(E.invitations.list);
    return Array.isArray(result) ? result : result?.data || [];
  },

  create: async (input: CreateInvitationInput): Promise<{ code: string; invitation: Invitation }> => {
    return call(E.invitations.create, undefined, { body: input });
  },

  revoke: async (id: string): Promise<void> => {
    await call(E.invitations.revoke, { id });
  },
};

// ============================================================================
// TEAM API (colleagues in the user's visible spaces)
// ============================================================================

export const teamApi = {
  list: async (): Promise<Colleague[]> => {
    const result = await call(E.locations.team);
    return Array.isArray(result) ? result : result?.data || [];
  },
  // Org-wide management directory (admins + "Show in Management" members),
  // independent of space membership.
  managers: async (): Promise<Colleague[]> => {
    const result = await call(E.organizations.contacts);
    return Array.isArray(result) ? result : result?.data || [];
  },
};
