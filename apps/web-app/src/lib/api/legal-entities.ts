import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { LegalEntity, LegalEntityInput } from './types/legal-entities';
import { legalEntitiesWebEndpoints } from '@hbcfield/shared/client';

export const legalEntitiesApi = {
  list: async (opts?: { includeInactive?: boolean }) => {
    const response = await call(
      legalEntitiesWebEndpoints.list,
      undefined,
      { query: { includeInactive: opts?.includeInactive ? 'true' : undefined } }) as ApiResponse<{ success: boolean; data: LegalEntity[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? [];
  },
  create: async (data: LegalEntityInput) => {
    const response = await call(
      legalEntitiesWebEndpoints.create,
      undefined,
      { body: data }) as ApiResponse<{ success: boolean; data: LegalEntity }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  update: async (id: string, data: LegalEntityInput) => {
    const response = await call(
      legalEntitiesWebEndpoints.update,
      { id },
      { body: data }) as ApiResponse<{ success: boolean; data: LegalEntity }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  setMain: async (id: string) => {
    const response = await call(
      legalEntitiesWebEndpoints.setMain,
      { id },
      { body: {} }) as ApiResponse<{ success: boolean; data: LegalEntity }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  setActive: async (id: string, active: boolean) => {
    const response = await (active
      ? (call(legalEntitiesWebEndpoints.setActive, { id }, { body: {} }) as Promise<ApiResponse<{ success: boolean; data: LegalEntity }>>)
      : (call(
        legalEntitiesWebEndpoints.setActivePost,
        { id },
        { body: {} }) as Promise<ApiResponse<{ success: boolean; data: LegalEntity }>>));
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
};
