/**
 * The approvals inbox — every kind's own list and action, run as the caller by
 * the gateway (packages/shared/src/approvals). Online only: a decision is never
 * queued, because somebody else may make it first.
 */
import { call, E } from './client';
import type {
  ApprovalDecision,
  ApprovalKind,
  ApprovalRouting,
  ApprovalsCount,
  ApprovalsResponse,
  StandInInput,
  StandInView,
  StandInsResponse,
} from '@hbcfield/shared/client';

export const approvalsApi = {
  list: async (): Promise<ApprovalsResponse> => {
    const r = await call(E.approvals.list);
    return (r?.items ? r : r?.data) ?? { items: [], unavailable: [], generatedAt: '' };
  },
  count: async (): Promise<ApprovalsCount> => {
    const r = await call(E.approvals.count);
    return (typeof r?.total === 'number' ? r : r?.data) ?? { total: 0, now: 0, byKind: {} };
  },
  route: async (kind: ApprovalKind, id: string): Promise<ApprovalRouting> => {
    const r = await call(E.approvals.route, { kind, id });
    return (Array.isArray(r?.deciders) ? r : r?.data) ?? { deciders: [], moreDeciders: 0, told: [] };
  },
  standIns: async (): Promise<StandInsResponse> => {
    const r = await call(E.approvals.standIns);
    return Array.isArray(r?.given) ? r : r?.data;
  },
  createStandIn: async (input: StandInInput): Promise<StandInView> => {
    const r = await call(E.approvals.createStandIn, undefined, { body: input });
    return r?.id ? r : r?.data;
  },
  endStandIn: async (id: string): Promise<void> => {
    await call(E.approvals.endStandIn, { id }, { body: {} });
  },
  /** `stage: 'FIRST_STEP'` = approved by them, still waiting for the second person (`waitingFor`). */
  decide: async (decision: ApprovalDecision): Promise<{ stage?: 'FIRST_STEP'; waitingFor?: string }> => {
    const r = await call(E.approvals.decide, undefined, { body: decision });
    return (r?.decided ? r : r?.data) ?? {};
  },
};
