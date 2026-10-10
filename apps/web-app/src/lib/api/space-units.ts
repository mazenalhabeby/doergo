import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { SpaceUnit, UnitActivity } from './types/space-units';
import { spaceUnitsWebEndpoints } from '@hbcfield/shared/client';

export const spaceUnitsApi = {
  /** One apartment/unit by id (org-scoped) — for the apartment detail page. */
  get: async (unitId: string): Promise<SpaceUnit> => {
    const res = await call(spaceUnitsWebEndpoints.get, { unitId }) as ApiResponse<{ data: SpaceUnit }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  list: async (spaceId: string): Promise<SpaceUnit[]> => {
    const res = await call(spaceUnitsWebEndpoints.list, { spaceId }) as ApiResponse<{ data: SpaceUnit[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
  create: async (spaceId: string, input: { name?: string; address?: string; lat?: number; lng?: number; contactName?: string; contactPhone?: string; residentUserId?: string | null; customerId?: string | null; details?: { label: string; value: string }[] }): Promise<SpaceUnit> => {
    const res = await call(spaceUnitsWebEndpoints.create, { spaceId }, { body: input }) as ApiResponse<SpaceUnit>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  update: async (spaceId: string, unitId: string, input: { name?: string; address?: string; lat?: number; lng?: number; contactName?: string | null; contactPhone?: string | null; residentUserId?: string | null; customerId?: string | null; details?: { label: string; value: string }[] }): Promise<SpaceUnit> => {
    const res = await call(spaceUnitsWebEndpoints.update, { spaceId, unitId }, { body: input }) as ApiResponse<SpaceUnit>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  remove: async (spaceId: string, unitId: string) => {
    const res = await call(spaceUnitsWebEndpoints.remove, { spaceId, unitId }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  /** Set (or clear, unitId=null) a member's apartment from the member side. */
  assignMember: async (spaceId: string, input: { userId: string; unitId: string | null }) => {
    const res = await call(spaceUnitsWebEndpoints.assignMember, { spaceId }, { body: input }) as ApiResponse<{ data: { success: boolean; unitId: string | null } }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  // ── Apartment activity timeline (notes + system events) ──
  activities: async (unitId: string): Promise<UnitActivity[]> => {
    const res = await call(spaceUnitsWebEndpoints.activities, { unitId }) as ApiResponse<{ data: UnitActivity[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
  addNote: async (unitId: string, body: string): Promise<UnitActivity> => {
    const res = await call(spaceUnitsWebEndpoints.addNote, { unitId }, { body: { body } }) as ApiResponse<{ data: UnitActivity }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
};
