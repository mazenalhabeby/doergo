import type { OvertimeRequest } from '@hbcfield/shared/client';
import { call, E } from './client';

export type { OvertimeRequest };

export const overtimeApi = {
  getActive: async (): Promise<OvertimeRequest | null> => {
    return call(E.overtime.active);
  },

  respond: async (data: { response: 'YES' | 'NO'; reason?: string }): Promise<unknown> => {
    return call(E.overtime.respond, undefined, { body: data });
  },

  approveRemote: async (id: string, data: { maxDurationMinutes: number; notes?: string }): Promise<unknown> => {
    return call(E.overtime.approve, { id }, { body: data });
  },

  approveSignature: async (
    id: string,
    data: {
      approverId: string;
      leaderName: string;
      leaderSignature: string;
      maxDurationMinutes: number;
      notes?: string;
    },
  ): Promise<unknown> => {
    return call(E.overtime.approveSignature, { id }, { body: data });
  },

  reject: async (id: string, data: { reason: string }): Promise<unknown> => {
    return call(E.overtime.reject, { id }, { body: data });
  },

  getPendingApprovals: async (): Promise<OvertimeRequest[]> => {
    return call(E.overtime.pendingApprovals);
  },

  getHistory: async (params?: {
    technicianId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<unknown> => {
    return call(E.overtime.history, { ...params });
  },
};
