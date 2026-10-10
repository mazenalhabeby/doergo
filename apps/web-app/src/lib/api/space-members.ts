import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { spaceMembersWebEndpoints, type SpaceMember } from '@hbcfield/shared/client';

export const spaceMembersApi = {
  list: async (spaceId: string) => {
    const res = await call(spaceMembersWebEndpoints.list, { spaceId }) as ApiResponse<{ success: boolean; data: SpaceMember[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data || [];
  },
  assign: async (spaceId: string, data: { userId: string; spaceRoleId?: string | null }) => {
    const res = await call(spaceMembersWebEndpoints.assign, { spaceId }, { body: data }) as ApiResponse<{ success: boolean; data: SpaceMember }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  remove: async (spaceId: string, memberId: string) => {
    const res = await call(spaceMembersWebEndpoints.remove, { spaceId, memberId }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  /**
   * What this member is billed at, AT THIS CLIENT.
   *
   * ⚠️ Null clears it back to inherit — the member's own rate, then the
   * client's, then the organisation's. Sending 0 says "billed at nothing",
   * which is a rate and not a blank.
   */
  updateRate: async (
    spaceId: string,
    memberId: string,
    data: { billRateCents?: number | null; costRateCents?: number | null; costDayCents?: number | null; effectiveFrom?: string },
  ) => {
    const res = await call(spaceMembersWebEndpoints.updateRate, { spaceId, memberId }, { body: data }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  /**
   * A member's roles and billing here. Undefined leaves a field alone; null
   * clears it. The management role is checked against the caller's own grants.
   */
  updateRoles: async (
    spaceId: string,
    memberId: string,
    data: {
      workRoleId?: string | null
      managementRoleId?: string | null
      allowSecondRole?: boolean
      billBy?: 'HOUR' | 'DAY' | 'BOTH' | null
      hoursBasis?: 'COUNTED' | 'CLOCKED' | 'SHIFT' | null
    },
  ) => {
    const res = await call(spaceMembersWebEndpoints.updateRoles, { spaceId, memberId }, { body: data }) as ApiResponse<{ success: boolean; data: SpaceMember }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  updateRouting: async (
    spaceId: string,
    memberId: string,
    data: {
      notifyRoleIds?: string[]
      notifyUserIds?: string[]
      contactRoleIds?: string[]
      contactUserIds?: string[]
      approveRoleIds?: string[]
      approveUserIds?: string[]
    },
  ) => {
    const res = await call(spaceMembersWebEndpoints.updateRouting, { spaceId, memberId }, { body: data }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
};
