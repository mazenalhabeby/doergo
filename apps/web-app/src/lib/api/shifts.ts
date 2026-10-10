import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { CreateShiftInput } from './types/shifts';
import { shiftsEndpoints, type Shift } from '@hbcfield/shared/client';

export const shiftsApi = {
  list: async (spaceId?: string) => {
    const res = await call(shiftsEndpoints.list, undefined, { query: { spaceId } }) as ApiResponse<{ success: boolean; data: Shift[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data || [];
  },
  create: async (data: CreateShiftInput) => {
    const res = await call(shiftsEndpoints.create, undefined, { body: data }) as ApiResponse<{ success: boolean; data: Shift }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  update: async (id: string, data: Partial<CreateShiftInput> & { isActive?: boolean }) => {
    const res = await call(shiftsEndpoints.update, { id }, { body: data }) as ApiResponse<{ success: boolean; data: Shift }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  remove: async (id: string) => {
    const res = await call(shiftsEndpoints.remove, { id }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
};
