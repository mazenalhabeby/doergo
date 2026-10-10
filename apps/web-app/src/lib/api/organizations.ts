import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { fetchAllPages } from '../paginate';
import { MEMBER_DIRECTORY_PAGE_SIZE } from '../query-keys';
import type { AccessRole, MemberStatement, MemberWatcher, OrgMember, OrganizationProfile, UpdateMemberInput } from './types/organizations';
import { organizationsEndpoints } from '@hbcfield/shared/client';

export const organizationsApi = {
  getJoinCode: async () => {
    const response = await call(organizationsEndpoints.joinCode) as ApiResponse<{
      success: boolean;
      data: { hasJoinCode: boolean; joinCode: string | null; joinPolicy: string };
    }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  regenerateJoinCode: async () => {
    const response = await call(organizationsEndpoints.regenerateJoinCode) as ApiResponse<{
      success: boolean;
      data: { joinCode: string };
    }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  updateSettings: async (data: { joinPolicy: string }) => {
    const response = await call(organizationsEndpoints.updateSettings, undefined, { body: data }) as ApiResponse<{
      success: boolean;
      data: { joinPolicy: string };
    }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** The organization's annual vacation days (ADMIN only). */
  updateLeavePolicy: async (defaultLeaveAllowance: number) => {
    const response = await call(organizationsEndpoints.updateLeavePolicy, undefined, { body: { defaultLeaveAllowance } }) as ApiResponse<unknown>;
    return response.data;
  },

  getRoles: async (scope?: "org" | "space"): Promise<AccessRole[]> => {
    const response = await call(organizationsEndpoints.roles, undefined, { query: { scope: scope === "space" ? "space" : undefined } }) as ApiResponse<{ success: boolean; data: AccessRole[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  createRole: async (input: { name: string; description?: string; color?: string; permissions?: Record<string, boolean> }): Promise<AccessRole> => {
    const response = await call(organizationsEndpoints.createRole, undefined, { body: input }) as ApiResponse<{ success: boolean; data: AccessRole }>;
    if (response.error) throw apiError(response);
    return response.data!.data;
  },

  updateRole: async (id: string, input: { name?: string; description?: string; color?: string; permissions?: Record<string, boolean> }): Promise<AccessRole> => {
    const response = await call(organizationsEndpoints.updateRole, { id }, { body: input }) as ApiResponse<{ success: boolean; data: AccessRole }>;
    if (response.error) throw apiError(response);
    return response.data!.data;
  },

  /**
   * Hand the organization to another member.
   *
   * Owner-only, enforced by the server: no permission grants this, because an
   * admin who could take ownership could then remove the founder.
   */
  transferOwnership: async (newOwnerId: string): Promise<void> => {
    const response = await call(organizationsEndpoints.transferOwnership, undefined, { body: { newOwnerId } }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
  },

  deleteRole: async (id: string): Promise<void> => {
    const response = await call(organizationsEndpoints.removeRole, { id }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
  },

  getMembers: async (params?: {
    search?: string; role?: string; page?: number; limit?: number;
    /** Only admins and managers (by role), filtered in the query. */
    managersOnly?: boolean;
    /** Ids to keep even if they no longer qualify (already-granted picks). */
    includeIds?: string[];
    /** Member to leave out — the person the picker is about. */
    excludeId?: string;
    /** Identity + presence only. For lists that show people, not permissions. */
    lite?: boolean;
  }) => {
    const response = await call(organizationsEndpoints.members, undefined, { query: {
      search: params?.search,
      role: params?.role !== 'all' ? params?.role : undefined,
      page: params?.page,
      limit: params?.limit,
      managersOnly: params?.managersOnly ? 'true' : undefined,
      includeIds: params?.includeIds?.length ? params.includeIds.join(',') : undefined,
      excludeId: params?.excludeId,
      lite: params?.lite ? 'true' : undefined,
    } }) as ApiResponse<{
      success: boolean;
      data: OrgMember[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  /**
   * The WHOLE directory — every page, 200 at a time (the server's cap).
   *
   * Pickers used to ask for `{ limit: 200 }` once and silently lost everybody
   * past the 200th; each also kept its own key and page size. One request, one
   * key (`keys.members.directory()` / `directoryLite()`), shared by every picker.
   * `lite`: identity and presence only, for lists that draw faces and names.
   */
  getAllMembers: (opts: { lite?: boolean } = {}): Promise<OrgMember[]> =>
    fetchAllPages<OrgMember>((page) =>
      organizationsApi.getMembers({ page, limit: MEMBER_DIRECTORY_PAGE_SIZE, ...(opts.lite ? { lite: true } : {}) }),
    ),

  // Fetch a SINGLE member by id (same shape as a list row) — for the member
  // detail page, so it doesn't pull the whole org and find() one (P1).
  /**
   * A worker's statement: hours per workspace × their rate with us, for a
   * period. Needs `canViewLabourCost`. Read-only — nothing is stored.
   */
  getStatement: async (memberId: string, period: { from?: string; to?: string }) => {
    const res = await call(organizationsEndpoints.statement, { id: memberId }, { query: period }) as ApiResponse<{ success: boolean; data: MemberStatement }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  getMember: async (memberId: string) => {
    const response = await call(organizationsEndpoints.member, { id: memberId }) as ApiResponse<{ success: boolean; data: OrgMember }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? null;
  },

  // Contacts directory — any org member can reach the org's admins/managers.
  getContacts: async () => {
    const response = await call(organizationsEndpoints.contacts) as ApiResponse<{ success: boolean; data: OrgMember[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? [];
  },

  updateMember: async (memberId: string, data: UpdateMemberInput) => {
    const response = await call(organizationsEndpoints.updateMember, { id: memberId }, { body: data }) as ApiResponse<{
      success: boolean;
      data: OrgMember;
    }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  resetMemberPassword: async (memberId: string) => {
    const response = await call(organizationsEndpoints.resetMemberPassword, { id: memberId }) as ApiResponse<{
      success: boolean;
      temporaryPassword: string;
    }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  removeMember: async (memberId: string) => {
    const response = await call(organizationsEndpoints.removeMember, { id: memberId }) as ApiResponse<{
      success: boolean;
      message: string;
    }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // Notification routing — who gets notified ABOUT this member.
  getMemberWatchers: async (memberId: string) => {
    const response = await call(organizationsEndpoints.watchers, { id: memberId }) as ApiResponse<{ data: MemberWatcher[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },
  setMemberWatchers: async (memberId: string, watcherIds: string[]) => {
    const response = await call(organizationsEndpoints.setWatchers, { id: memberId }, { body: { watcherIds } }) as ApiResponse<{ data: MemberWatcher[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  getProfile: async () => {
    const response = await call(organizationsEndpoints.profile) as ApiResponse<{ success: boolean; data: OrganizationProfile }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  updateProfile: async (updates: Partial<OrganizationProfile>) => {
    const response = await call(organizationsEndpoints.updateProfile, undefined, { body: updates }) as ApiResponse<{ success: boolean; data: OrganizationProfile }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  updateNotificationPrefs: async (prefs: Record<string, boolean>) => {
    const response = await call(organizationsEndpoints.updateNotificationPrefs, undefined, { body: prefs }) as ApiResponse<{ success: boolean; data: OrganizationProfile }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  getAuditLogs: async (params?: {
    eventType?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await call(organizationsEndpoints.auditLogs, undefined, { query: params ?? {} }) as ApiResponse<{
      data: Array<{
        id: string;
        eventType: string;
        userId: string | null;
        user: { id: string; firstName: string; lastName: string; email: string } | null;
        targetUserId: string | null;
        targetUser: { id: string; firstName: string; lastName: string; email: string } | null;
        resourceType: string | null;
        resourceId: string | null;
        metadata: Record<string, unknown> | null;
        ipAddress: string | null;
        createdAt: string;
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
};
