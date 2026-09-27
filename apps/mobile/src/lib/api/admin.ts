/**
 * Admin API — endpoints for admin management features on mobile
 * Join requests, members, invitations, organization settings
 */
import { fetchWithAuth } from './client';
import { buildUrlWithQuery } from '@hbcfield/shared/client';

// ============================================================================
// TYPES
// ============================================================================

export interface JoinRequest {
  id: string;
  userId: string;
  organizationId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface OrgMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  platform: string;
  isActive: boolean;
  avatarUrl?: string | null;
  position?: string | null;
  specialty?: string | null;
  // Access Profile blob — read via the shared getAccessPlatforms/isFieldWorker
  // helpers (drives office-vs-field). Replaces the removed `workMode`.
  enabledModules?: string[] | Record<string, unknown> | null;
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null;
  lastActiveAt?: string | null;
  /** The organization role this member holds — its own name and colour. */
  memberRole?: { id: string; name: string; color?: string | null } | null;
  isExternal?: boolean;
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  createdAt: string;
}

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
// JOIN REQUESTS API
// ============================================================================

export const joinRequestsApi = {
  list: async (params?: { status?: string }): Promise<JoinRequest[]> => {
    const endpoint = buildUrlWithQuery('/join-requests', params ?? {});
    const result = await fetchWithAuth<any>(endpoint);
    return Array.isArray(result) ? result : result?.data || [];
  },

  approve: async (id: string, data: {
    role: string;
    platform?: string;
    workMode?: string;
    specialty?: string;
  }): Promise<void> => {
    await fetchWithAuth<any>(`/join-requests/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  reject: async (id: string, reason?: string): Promise<void> => {
    await fetchWithAuth<any>(`/join-requests/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
  },
};

// ============================================================================
// MEMBERS API
// ============================================================================

export const membersApi = {
  list: async (): Promise<OrgMember[]> => {
    const result = await fetchWithAuth<any>('/organizations/members');
    return Array.isArray(result) ? result : result?.data || result?.members || [];
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
    await fetchWithAuth<any>(`/organizations/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ memberRoleId }),
    });
  },

  remove: async (id: string): Promise<void> => {
    await fetchWithAuth<any>(`/organizations/members/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// INVITATIONS API (admin)
// ============================================================================

export const adminInvitationsApi = {
  list: async (): Promise<Invitation[]> => {
    const result = await fetchWithAuth<any>('/invitations');
    return Array.isArray(result) ? result : result?.data || [];
  },

  create: async (input: CreateInvitationInput): Promise<{ code: string; invitation: Invitation }> => {
    return fetchWithAuth<{ code: string; invitation: Invitation }>('/invitations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  revoke: async (id: string): Promise<void> => {
    await fetchWithAuth<any>(`/invitations/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// ORGANIZATION SETTINGS API
// ============================================================================

/** The organization's roles (org scope) — the names the Members screen filters by and approving assigns. */
export interface OrgRole { id: string; name: string; slug?: string; color?: string | null; scope: string; isSystem?: boolean }
export const rolesApi = {
  list: async (): Promise<OrgRole[]> => {
    const result = await fetchWithAuth<any>('/organizations/roles');
    return Array.isArray(result) ? result : result?.data ?? [];
  },
};

export const orgSettingsApi = {
  /** ⚠️ The server answers `joinCode`, not `code` — the old type named a field that never arrived. */
  getJoinCode: async (): Promise<{ hasJoinCode: boolean; joinPolicy: string; joinCode?: string | null }> => {
    return fetchWithAuth<any>('/organizations/join-code');
  },

  regenerateJoinCode: async (): Promise<{ code: string }> => {
    return fetchWithAuth<any>('/organizations/regenerate-join-code', {
      method: 'POST',
    });
  },
};

// ============================================================================
// TEAM API (colleagues in the user's visible spaces)
// ============================================================================

export interface Colleague {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  position?: string | null;
  role?: string;
  spaceName?: string | null;
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null;
  /** "Show in Management" — surfaces this member in the Managers group. */
  contactable?: boolean;
}

export const teamApi = {
  list: async (): Promise<Colleague[]> => {
    const result = await fetchWithAuth<any>('/locations/team');
    return Array.isArray(result) ? result : result?.data || [];
  },
  // Org-wide management directory (admins + "Show in Management" members),
  // independent of space membership.
  managers: async (): Promise<Colleague[]> => {
    const result = await fetchWithAuth<any>('/organizations/contacts');
    return Array.isArray(result) ? result : result?.data || [];
  },
};
