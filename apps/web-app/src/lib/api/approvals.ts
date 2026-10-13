import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import {
  approvalsEndpoints,
  type ApprovalDecision,
  type ApprovalsCount,
  type ApprovalsResponse,
} from '@hbcfield/shared/client';

/** The approvals inbox — every kind's own list and action, run as the caller by the gateway. */
export const approvalsApi = {
  list: async (): Promise<ApprovalsResponse> => {
    const res = await call(approvalsEndpoints.list) as ApiResponse<{ data: ApprovalsResponse }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  count: async (): Promise<ApprovalsCount> => {
    const res = await call(approvalsEndpoints.count) as ApiResponse<{ data: ApprovalsCount }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  decide: async (decision: ApprovalDecision): Promise<void> => {
    const res = await call(approvalsEndpoints.decide, undefined, { body: decision }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
  },
};
