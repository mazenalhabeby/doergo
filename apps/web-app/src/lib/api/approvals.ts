import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import {
  approvalsEndpoints,
  type ApprovalDecision,
  type ApprovalKind,
  type ApprovalRouting,
  type StandInInput,
  type ApprovalRuleInput,
  type ApprovalRuleView,
  type StandInView,
  type StandInsResponse,
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
  route: async (kind: ApprovalKind, id: string): Promise<ApprovalRouting> => {
    const res = await call(approvalsEndpoints.route, { kind, id }) as ApiResponse<{ data: ApprovalRouting }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  standIns: async (): Promise<StandInsResponse> => {
    const res = await call(approvalsEndpoints.standIns) as ApiResponse<{ data: StandInsResponse }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  createStandIn: async (input: StandInInput): Promise<StandInView> => {
    const res = await call(approvalsEndpoints.createStandIn, undefined, { body: input }) as ApiResponse<{ data: StandInView }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  endStandIn: async (id: string): Promise<void> => {
    const res = await call(approvalsEndpoints.endStandIn, { id }, { body: {} }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
  },
  rules: async (): Promise<ApprovalRuleView[]> => {
    const res = await call(approvalsEndpoints.rules) as ApiResponse<{ data: ApprovalRuleView[] }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  saveRule: async (input: ApprovalRuleInput, id?: string): Promise<void> => {
    const res = (id
      ? await call(approvalsEndpoints.updateRule, { id }, { body: input })
      : await call(approvalsEndpoints.createRule, undefined, { body: input })) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
  },
  deleteRule: async (id: string): Promise<void> => {
    const res = await call(approvalsEndpoints.deleteRule, { id }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
  },
  /** `stage: 'FIRST_STEP'` = approved by them, still waiting for the second person (`waitingFor`). */
  decide: async (decision: ApprovalDecision): Promise<{ stage?: 'FIRST_STEP'; waitingFor?: string }> => {
    const res = await call(approvalsEndpoints.decide, undefined, { body: decision }) as ApiResponse<{ data: { stage?: 'FIRST_STEP'; waitingFor?: string } }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? {};
  },
};
