import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { SupportConfig } from './types/support';
import { supportEndpoints, type SupportAttachment, type SupportMessage, type SupportTicket } from '@hbcfield/shared/client';

export const supportApi = {
  getConfig: async (): Promise<SupportConfig> => {
    const res = await call(supportEndpoints.config) as ApiResponse<{ data: SupportConfig }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  list: async (status?: string): Promise<{ data: SupportTicket[]; meta: { total: number } }> => {
    const res = await call(supportEndpoints.tickets, undefined, { query: { status: status || undefined } }) as ApiResponse<{ data: SupportTicket[]; meta: { total: number } }>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  get: async (id: string): Promise<SupportTicket> => {
    const res = await call(supportEndpoints.ticket, { id }) as ApiResponse<{ data: SupportTicket }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  create: async (payload: {
    subject: string;
    body: string;
    category?: string;
    channel?: string;
    attachments?: SupportAttachment[];
  }): Promise<SupportTicket> => {
    const res = await call(supportEndpoints.create, undefined, { body: payload }) as ApiResponse<{ data: SupportTicket }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  reply: async (id: string, body: string, attachments?: SupportAttachment[]): Promise<SupportMessage> => {
    const res = await call(supportEndpoints.reply, { id }, { body: { body, attachments } }) as ApiResponse<{ data: SupportMessage }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  markRead: async (id: string): Promise<void> => {
    await call(supportEndpoints.markRead, { id }, { body: {} }) as ApiResponse<unknown>;
  },
};
