import { fetchWithAuth } from './client';
import { path } from './path';
import { buildUrlWithQuery } from '@hbcfield/shared/client';
import type { SupportTicket, SupportMessage, SupportAttachment } from '@hbcfield/shared/client';

export interface SupportConfig {
  tier: string | null;
  slaBusinessMinutes: number;
  liveChat: boolean;
  priorityRouting: boolean;
  dedicatedSupport: boolean;
}

/*
  Support API (customer / mobile).

  ⚠️ DO NOT UNWRAP `.data` HERE. `fetchWithAuth` already does it — its last line
  is `return (data.data ?? data) as T`, so what comes back is the payload, not
  the envelope around it.

  Every method in this file used to unwrap a second time
  (`fetchWithAuth<{ data: T }>(...)` then `return res.data`), which made the
  whole screen unusable: the config resolved to `undefined` so the SLA line
  rendered empty and live chat read as off, the ticket list resolved to
  `undefined` so the screen crashed on `tickets.length`, and opening, creating
  or replying to a ticket would have crashed the same way.

  ⚠️ The types could not catch it. `fetchWithAuth<T>` casts its result to `T`,
  so declaring `<{ data: SupportTicket }>` simply asserts a shape that never
  arrives at runtime — `tsc` was clean the whole time this was broken.

  ⚠️ `fetchWithAuth` resolves to the envelope's `data` and nothing beside it.
  `list` therefore returns the array, which is what it actually resolves to;
  a caller that needs `meta` (a total) asks `fetchPageWithAuth`.
*/
export const supportApi = {
  getConfig: async (): Promise<SupportConfig> =>
    fetchWithAuth<SupportConfig>('/support/config', { method: 'GET' }),

  list: async (status?: string): Promise<SupportTicket[]> =>
    fetchWithAuth<SupportTicket[]>(
      buildUrlWithQuery('/support/tickets', { status }),
      { method: 'GET' },
    ),

  get: async (id: string): Promise<SupportTicket> =>
    fetchWithAuth<SupportTicket>(path`/support/tickets/${id}`, { method: 'GET' }),

  create: async (payload: {
    subject: string;
    body: string;
    category?: string;
    attachments?: SupportAttachment[];
  }): Promise<SupportTicket> =>
    fetchWithAuth<SupportTicket>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify({ ...payload, channel: 'MOBILE' }),
    }),

  reply: async (id: string, body: string, attachments?: SupportAttachment[]): Promise<SupportMessage> =>
    fetchWithAuth<SupportMessage>(path`/support/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, attachments }),
    }),

  markRead: async (id: string): Promise<void> => {
    await fetchWithAuth(path`/support/tickets/${id}/read`, { method: 'POST', body: '{}' });
  },
};
