import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { CreateInvoiceInput, Invoice, InvoiceGatherResult, InvoiceItem, InvoiceItemInput, UpdateInvoiceInput } from './types/invoices';
import type { PaginationMeta } from './types/overtime';
import { invoicesWebEndpoints } from '@hbcfield/shared/client';

export const invoicesApi = {
  list: async (params?: { status?: string; spaceId?: string; legalEntityId?: string; page?: number; limit?: number }) => {
    const response = await call(invoicesWebEndpoints.list, undefined, { query: params ?? {} }) as ApiResponse<{ success: boolean; data: Invoice[]; meta?: PaginationMeta }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
  /**
   * Draft lines from completed work — from a workspace OR from a client.
   *
   * ⚠️ Exactly one. Both together would silently intersect, and an empty result
   * then reads as "nothing to bill" when it means "these two do not overlap".
   * The server refuses the combination rather than guessing which was meant.
   */
  gather: async (source: { spaceId?: string; customerId?: string; from?: string; to?: string }) => {
    const response = await call(invoicesWebEndpoints.gather, undefined, { query: source }) as ApiResponse<{ success: boolean; data: InvoiceGatherResult }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  getById: async (id: string) => {
    const response = await call(invoicesWebEndpoints.getById, { id }) as ApiResponse<{ success: boolean; data: Invoice }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  create: async (data: CreateInvoiceInput): Promise<Invoice> => {
    const response = await call(invoicesWebEndpoints.create, undefined, { body: data }) as ApiResponse<{ success: boolean; data: Invoice }>;
    if (response.error) throw apiError(response);
    // A create that comes back with no invoice is a failure, not a success with
    // nothing in it. The caller redirects to `invoice.id`, so returning
    // undefined here sent it to /invoices/undefined.
    if (!response.data?.data) throw new Error('The invoice was not created');
    return response.data.data;
  },
  /** `1 {currency} = rate {the organization's}` on a day (ECB). `rate` null = none known. */
  exchangeRate: async (currency: string, date?: string) => {
    const response = await call(invoicesWebEndpoints.exchangeRate, undefined, { query: { currency, date } }) as ApiResponse<{ success: boolean; data: { from: string; to: string; rate: number | null; date: string | null; source: 'ECB' | null } }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? null;
  },
  update: async (id: string, data: UpdateInvoiceInput) => {
    const response = await call(invoicesWebEndpoints.update, { id }, { body: data }) as ApiResponse<{ success: boolean; data: Invoice }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  updateStatus: async (id: string, status: string) => {
    const response = await call(invoicesWebEndpoints.updateStatus, { id }, { body: { status } }) as ApiResponse<{ success: boolean; data: Invoice }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  delete: async (id: string) => {
    const response = await call(invoicesWebEndpoints.delete, { id }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
  addItem: async (id: string, item: InvoiceItemInput) => {
    const response = await call(invoicesWebEndpoints.addItem, { id }, { body: item }) as ApiResponse<{ success: boolean; data: InvoiceItem }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  removeItem: async (id: string, itemId: string) => {
    const response = await call(invoicesWebEndpoints.removeItem, { id, itemId }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
};
