import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { SpaceUnit } from './types/space-units';
import { spaceUnitsWebEndpoints } from '@hbcfield/shared/client';

export const spaceUnitsApi = {
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
};
