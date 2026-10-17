/** Message contracts for auth-service `invoices` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

export const memberStatement = rpc<{ organizationId: string; memberId: string; from?: string; to?: string }>(
  'member_statement',
);
export const invoiceCreate = rpc<{
  organizationId: string;
  createdById: string;
  spaceId?: string;
  /** The company that issues it; omitted = the workspace's → the client's → the main one. */
  legalEntityId?: string | null;
  /** The client being billed outside a workspace — only so its company can issue it. */
  customerId?: string | null;
  clientName?: string;
  clientEmail?: string;
  clientAddress?: string;
  currency?: string;
  /** 1 {currency} = exchangeRate {the organization's}; null clears, omitted asks the ECB. */
  exchangeRate?: number | string | null;
  exchangeRateSource?: string | null;
  exchangeRateDate?: string | null;
  /** The HOURS / DAYS tag before each labour line (default shown). */
  showLineTags?: boolean;
  taxRate?: number;
  discount?: number;
  issueDate?: string;
  dueDate?: string;
  /** The days this invoice covers, `YYYY-MM-DD`. Either end may be omitted. */
  servicePeriodFrom?: string;
  servicePeriodTo?: string;
  notes?: string;
  items?: {
    description: string;
    quantity?: number;
    unitPrice?: number;
    taskId?: string;
    reportId?: string;
    /** The rates that applied when this line was drawn up. See below. */
    billRateCents?: number | null;
    costRateCents?: number | null;
    billedHours?: number | null;
    billedDays?: number | null;
    lineKind?: 'HOURS' | 'DAYS' | 'HEADING' | null;
    workerId?: string | null;
    dayFrom?: string | null;
    dayTo?: string | null;
    taskIds?: string[];
    hoursBasis?: string | null;
  }[];
}>('invoice_create');
export const invoiceList = rpc<{
  organizationId: string;
  status?: string;
  spaceId?: string;
  legalEntityId?: string;
  page?: number;
  limit?: number;
}>('invoice_list');
/** What the invoice gathers from: a workspace or a client, over a service period. */
export interface InvoiceGatherMessage {
  organizationId: string;
  spaceId?: string;
  customerId?: string;
  /** Service period — inclusive, `YYYY-MM-DD`. Either end may be omitted. */
  from?: string;
  to?: string;
}
export const invoiceGather = rpc<InvoiceGatherMessage>('invoice_gather');
export const invoiceExchangeRate = rpc<{ organizationId: string; currency: string; date?: string }>(
  'invoice_exchange_rate',
);
export const invoiceGet = rpc<{ id: string; organizationId: string }>('invoice_get');
export const invoiceUpdate = rpc<{ id: string; organizationId: string; [key: string]: any }>('invoice_update');
export const invoiceUpdateStatus = rpc<{ id: string; organizationId: string; status: string }>('invoice_update_status');
export const invoiceDelete = rpc<{ id: string; organizationId: string }>('invoice_delete');
export const invoiceAddItem = rpc<{ invoiceId: string; organizationId: string; item: any }>('invoice_add_item');
export const invoiceRemoveItem = rpc<{ invoiceId: string; itemId: string; organizationId: string }>(
  'invoice_remove_item',
);
export const legalEntityList = rpc<{ organizationId: string; withBank?: boolean; includeInactive?: boolean }>(
  'legal_entity_list',
);
export const legalEntityCreate = rpc<{ organizationId: string; input: Record<string, unknown> }>('legal_entity_create');
export const legalEntityUpdate = rpc<{ organizationId: string; id: string; input: Record<string, unknown> }>(
  'legal_entity_update',
);
export const legalEntitySetMain = rpc<{ organizationId: string; id: string }>('legal_entity_set_main');
export const legalEntitySetActive = rpc<{ organizationId: string; id: string; active: boolean }>(
  'legal_entity_set_active',
);
