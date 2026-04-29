import { fetchWithAuth } from './client';
import { buildUrlWithQuery } from '@hbcfield/shared/client';

export interface OvertimeRequest {
  id: string;
  technicianId: string;
  timeEntryId: string;
  locationId: string;
  status: string;
  technicianRespondedAt?: string;
  technicianReason?: string;
  approvalMethod?: 'REMOTE' | 'SIGNATURE';
  approvedById?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  leaderName?: string;
  maxDurationMinutes?: number;
  overtimeStartAt?: string;
  overtimeEndAt?: string;
  actualEndAt?: string;
  overtimeMinutes?: number;
  organizationId: string;
  createdAt: string;
  location?: { id: string; name: string };
  approvedBy?: { id: string; firstName: string; lastName: string };
}

export const overtimeApi = {
  getActive: async (): Promise<OvertimeRequest | null> => {
    return fetchWithAuth<OvertimeRequest | null>('/overtime/active', { method: 'GET' });
  },

  respond: async (data: { response: 'YES' | 'NO'; reason?: string }): Promise<any> => {
    return fetchWithAuth('/overtime/respond', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  approveRemote: async (id: string, data: { maxDurationMinutes: number; notes?: string }): Promise<any> => {
    return fetchWithAuth(`/overtime/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
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
  ): Promise<any> => {
    return fetchWithAuth(`/overtime/${id}/approve-signature`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  reject: async (id: string, data: { reason: string }): Promise<any> => {
    return fetchWithAuth(`/overtime/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getPendingApprovals: async (): Promise<OvertimeRequest[]> => {
    return fetchWithAuth<OvertimeRequest[]>('/overtime/pending-approvals', { method: 'GET' });
  },

  getHistory: async (params?: { technicianId?: string; status?: string; page?: number; limit?: number }): Promise<any> => {
    const endpoint = buildUrlWithQuery('/overtime/history', params ?? {});
    return fetchWithAuth(endpoint, { method: 'GET' });
  },
};
