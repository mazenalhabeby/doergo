import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { Colleague } from './types/team';
import { locationsEndpoints } from '@hbcfield/shared/client';

export const teamApi = {
  /** Colleagues in the current user's visible spaces. */
  list: async (): Promise<Colleague[]> => {
    const response = await call(locationsEndpoints.team) as ApiResponse<{ success: boolean; data: Colleague[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },
};
