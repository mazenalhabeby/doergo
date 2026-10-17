import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { CreateRotaInput } from './types/rota';
import { rotaEndpoints, type ShiftAssignment } from '@hbcfield/shared/client';

export const rotaApi = {
  list: async (spaceId: string, includeEnded = false) => {
    const res = await call(
      rotaEndpoints.listForSpace,
      { spaceId },
      { query: { includeEnded: includeEnded || undefined } }) as ApiResponse<{ success: boolean; data: ShiftAssignment[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data || [];
  },
  create: async (spaceId: string, data: CreateRotaInput) => {
    const res = await call(
      rotaEndpoints.createForSpace,
      { spaceId },
      { body: data }) as ApiResponse<{ success: boolean; data: ShiftAssignment }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  update: async (assignmentId: string, data: Partial<CreateRotaInput> & { isActive?: boolean }) => {
    const res = await call(
      rotaEndpoints.update,
      { id: assignmentId },
      { body: data }) as ApiResponse<{ success: boolean; data: ShiftAssignment }>;
    if (res.error) throw apiError(res);
    return res.data?.data;
  },
  remove: async (assignmentId: string) => {
    const res = await call(rotaEndpoints.remove, { id: assignmentId }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
};
