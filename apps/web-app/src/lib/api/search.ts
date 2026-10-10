import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { GlobalSearchResults } from './types/search';
import { searchWebEndpoints } from '@hbcfield/shared/client';

export const searchApi = {
  global: async (q: string): Promise<GlobalSearchResults> => {
    const empty: GlobalSearchResults = { tasks: [], members: [], spaces: [], customers: [] };
    if (!q || q.trim().length < 2) return empty;
    const res = await call(searchWebEndpoints.global, undefined, { query: { q: q.trim() } }) as ApiResponse<GlobalSearchResults>;
    if (res.error) throw apiError(res);
    return res.data ?? empty;
  },
};
