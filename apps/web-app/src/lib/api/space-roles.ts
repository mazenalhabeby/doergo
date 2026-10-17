import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { spaceRolesWebEndpoints, type PermissionSet, type SpaceRole, type SpaceRoleInSpace } from '@hbcfield/shared/client';

export const spaceRolesApi = {
  /** The roles as ONE workspace sees them: holders here, and work roles' day rates here. */
  listInSpace: async (spaceId: string) => {
    const res = await call(spaceRolesWebEndpoints.listInSpace, { spaceId }) as ApiResponse<{ success: boolean; data: SpaceRoleInSpace[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data || [];
  },
  /**
   * A work role's day rate in one workspace, from a day. Earlier days keep the
   * rate they were worked at — nothing is written over.
   */
  setDayRate: async (spaceId: string, roleId: string, data: { cents: number | null; effectiveFrom?: string }) => {
    const res = await call(
      spaceRolesWebEndpoints.setDayRate,
      { spaceId, roleId },
      { body: data }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  /** A work role's DEFAULT day rate — for every workspace without its own. */
  setDefaultDayRate: async (roleId: string, data: { cents: number | null; effectiveFrom?: string }) => {
    const res = await call(
      spaceRolesWebEndpoints.setDefaultDayRate,
      { roleId },
      { body: data }) as ApiResponse<{ success: boolean; data: unknown }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  create: async (
    data: {
      name: string;
      description?: string;
      color?: string;
      permissions?: PermissionSet;
      kind?: 'WORK' | 'MANAGEMENT';
      spaceId?: string
    }) => {
    const res = await call(spaceRolesWebEndpoints.create, undefined, { body: data }) as ApiResponse<{ success: boolean; data: SpaceRole }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  update: async (
    id: string,
    data: {
      name?: string;
      description?: string;
      color?: string;
      permissions?: PermissionSet;
      isActive?: boolean;
      kind?: 'WORK' | 'MANAGEMENT'
    },
  ) => {
    const res = await call(spaceRolesWebEndpoints.update, { id }, { body: data }) as ApiResponse<{ success: boolean; data: SpaceRole }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  remove: async (id: string) => {
    const res = await call(spaceRolesWebEndpoints.remove, { id }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  /** Switch a company work role on in this workspace. */
  useHere: async (spaceId: string, roleId: string) => {
    const res = await call(spaceRolesWebEndpoints.useHere, { spaceId, roleId }, { body: {} }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  /** Switch it off here only (refused while somebody here holds it). */
  dropHere: async (spaceId: string, roleId: string) => {
    const res = await call(spaceRolesWebEndpoints.dropHere, { spaceId, roleId }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  /** Fold a duplicate work role into another: its holders and day rates move, it is deleted. */
  merge: async (roleId: string, intoRoleId: string) => {
    const res = await call(spaceRolesWebEndpoints.merge, { roleId }, { body: { intoRoleId } }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
};
