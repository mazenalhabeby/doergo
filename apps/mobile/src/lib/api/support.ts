import { call, E } from './client';
import type { SupportConfig, SupportTicket, SupportMessage, SupportAttachment } from '@hbcfield/shared/client';

export type { SupportConfig };

/*
  Support API (customer / mobile).

  ⚠️ DO NOT UNWRAP `.data` HERE. The client already does it: what comes back
  is the payload, not the envelope around it.

  Every method in this file used to unwrap a second time, which made the whole
  screen unusable (the config resolved to `undefined`, the ticket list crashed
  on `tickets.length`) — and `tsc` was clean the whole time, because a cast
  result asserts a shape that never arrives at runtime.

  `list` returns the array; a caller that needs `meta` (a total) asks
  `api.page`.
*/
export const supportApi = {
  getConfig: async (): Promise<SupportConfig> =>
    call(E.support.config),

  list: async (status?: string): Promise<SupportTicket[]> =>
    call(E.support.tickets, { status }),

  get: async (id: string): Promise<SupportTicket> =>
    call(E.support.ticket, { id }),

  create: async (payload: {
    subject: string;
    body: string;
    category?: string;
    attachments?: SupportAttachment[];
  }): Promise<SupportTicket> =>
    call(E.support.create, undefined, { body: { ...payload, channel: 'MOBILE' } }),

  reply: async (id: string, body: string, attachments?: SupportAttachment[]): Promise<SupportMessage> =>
    call(E.support.reply, { id }, { body: { body, attachments } }),

  markRead: async (id: string): Promise<void> => {
    await call(E.support.markRead, { id });
  },
};
