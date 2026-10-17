import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { rateHistoryWebEndpoints } from '@hbcfield/shared/client';

/**
 * The dated history of one hourly rate — read with the same right as writing it.
 * Cost rows come back only for people who may see labour cost.
 */
export const rateHistoryApi = {
  list: async (q: { target: 'ORGANIZATION' | 'SPACE' | 'MEMBER' | 'ASSIGNMENT'; targetId: string; spaceId?: string }) => {
    const res = await call(rateHistoryWebEndpoints.list, undefined, { query: q }) as ApiResponse<{
      success: boolean;
      data: Array<{
        kind: 'BILL_HOUR' | 'COST_HOUR' | 'COST_DAY';
        cents: number | null;
        effectiveFrom: string;
        state: 'past' | 'scheduled'
      }>;
    }>;
    if (res.error) throw apiError(res);
    return res.data?.data || [];
  },
};
