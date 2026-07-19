import { fetchWithAuth } from './client';
import type { SupportTicket, SupportMessage, SupportAttachment } from '@hbcfield/shared/client';

export interface SupportConfig {
  tier: string | null;
  slaBusinessMinutes: number;
  liveChat: boolean;
  priorityRouting: boolean;
  dedicatedSupport: boolean;
}

// Support API (customer / mobile). Mirrors the web supportApi.
export const supportApi = {
  getConfig: async (): Promise<SupportConfig> => {
    const res = await fetchWithAuth<{ data: SupportConfig }>('/support/config', { method: 'GET' });
    return res.data;
  },
  list: async (status?: string): Promise<{ data: SupportTicket[]; meta: { total: number } }> => {
    return fetchWithAuth(`/support/tickets${status ? `?status=${status}` : ''}`, { method: 'GET' });
  },
  get: async (id: string): Promise<SupportTicket> => {
    const res = await fetchWithAuth<{ data: SupportTicket }>(`/support/tickets/${id}`, { method: 'GET' });
    return res.data;
  },
  create: async (payload: {
    subject: string;
    body: string;
    category?: string;
    attachments?: SupportAttachment[];
  }): Promise<SupportTicket> => {
    const res = await fetchWithAuth<{ data: SupportTicket }>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify({ ...payload, channel: 'MOBILE' }),
    });
    return res.data;
  },
  reply: async (id: string, body: string, attachments?: SupportAttachment[]): Promise<SupportMessage> => {
    const res = await fetchWithAuth<{ data: SupportMessage }>(`/support/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, attachments }),
    });
    return res.data;
  },
  markRead: async (id: string): Promise<void> => {
    await fetchWithAuth(`/support/tickets/${id}/read`, { method: 'POST', body: '{}' });
  },
};
