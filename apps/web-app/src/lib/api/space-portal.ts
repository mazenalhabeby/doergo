import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { PortalSummary, SpacePortalConfig } from './types/space-portal';
import type { SpaceUnit } from './types/space-units';
import { spacePortalWebEndpoints } from '@hbcfield/shared/client';

export const spacePortalApi = {
  /** All client portals bound to this space (a space can run several). */
  listPortals: async (spaceId: string): Promise<PortalSummary[]> => {
    const res = await call(spacePortalWebEndpoints.listPortals, { spaceId }) as ApiResponse<PortalSummary[]>;
    if (res.error) throw apiError(res);
    return res.data ?? [];
  },
  createPortal: async (spaceId: string, templateKey: string, name?: string): Promise<{ id: string }> => {
    const res = await call(spacePortalWebEndpoints.createPortal, { spaceId }, { body: { templateKey, name } }) as ApiResponse<{ id: string }>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  get: async (spaceId: string): Promise<SpacePortalConfig> => {
    const res = await call(spacePortalWebEndpoints.get, { spaceId }) as ApiResponse<{ data: SpacePortalConfig }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  setEntityType: async (spaceId: string, templateKey: string) => {
    const res = await call(spacePortalWebEndpoints.setEntityType, { spaceId }, { body: { templateKey } }) as ApiResponse<{ data: SpacePortalConfig }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  units: async (spaceId: string): Promise<SpaceUnit[]> => {
    const res = await call(spacePortalWebEndpoints.units, { spaceId }) as ApiResponse<{ data: SpaceUnit[] }>;
    if (res.error) throw apiError(res);
    return res.data!.data ?? [];
  },
  addUnit: async (spaceId: string, input: { name?: string; address?: string; lat?: number; lng?: number }) => {
    const res = await call(spacePortalWebEndpoints.addUnit, { spaceId }, { body: input }) as ApiResponse<SpaceUnit>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  deleteUnit: async (spaceId: string, unitId: string) => {
    const res = await call(spacePortalWebEndpoints.deleteUnit, { spaceId, unitId }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  assign: async (spaceId: string, unitId: string, customerId: string) => {
    const res = await call(spacePortalWebEndpoints.assign, { spaceId, unitId }, { body: { customerId } }) as ApiResponse<{ data: { success: boolean } }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
};
