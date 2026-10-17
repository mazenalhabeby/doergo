/**
 * invoices — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const invoicesWebEndpoints = defineEndpoints('invoices', {
  list: endpoint<void, unknown>({ method: 'GET', path: () => '/invoices' }),
  gather: endpoint<void, unknown>({ method: 'GET', path: () => '/invoices/gather' }),
  getById: endpoint<{ id: string }, unknown>({ method: 'GET', path: (a) => path`/invoices/${a.id}` }),
  create: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/invoices' }),
  exchangeRate: endpoint<void, unknown>({ method: 'GET', path: () => '/invoices/exchange-rate' }),
  update: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/invoices/${a.id}` }),
  updateStatus: endpoint<{ id: string }, unknown, unknown>({
    method: 'PATCH',
    path: (a) => path`/invoices/${a.id}/status`,
  }),
  delete: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/invoices/${a.id}` }),
  addItem: endpoint<{ id: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/invoices/${a.id}/items` }),
  removeItem: endpoint<{ id: string; itemId: string }, unknown, unknown>({
    method: 'DELETE',
    path: (a) => path`/invoices/${a.id}/items/${a.itemId}`,
  }),
});
