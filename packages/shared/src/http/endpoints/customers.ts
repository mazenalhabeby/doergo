/**
 * The client book (CRM): clients, their contact people, activities, addresses,
 * the home Clients card and the address-book import. Gateway: modules/customers.
 *
 * ⚠️ A contact is not a client (`Customer.isContact`), and the person record is
 * kept when a contact is detached.
 */
import type { ClientTypeParam, ContactsParam } from '../../crm/client-filter';
import type { ContactImportBody, ContactImportSummary } from '../../crm/contact-keys';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';

type Id = { id: string };

export interface CustomersListQuery {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  spaceId?: string;
  /** With a `spaceId`: also the clients filed in NO workspace (most of a real book). */
  includeUnfiled?: boolean;
  page?: number;
  limit?: number;
  /** From `clientFilterQuery()` — never hand-written at a call site. */
  type?: ClientTypeParam;
  contacts?: ContactsParam;
  /** false = B2B clients only, true = portal residents only, omitted = all. */
  portalResident?: boolean;
}

export const customersEndpoints = defineEndpoints('customers', {
  /** The client list; `client.page` for `meta` (total, crmCaps). */
  list: endpoint<CustomersListQuery | void, unknown[]>({
    method: 'GET',
    path: (q) => withQuery('/customers', q || undefined),
    keep: true,
  }),
  get: endpoint<Id, unknown>({ method: 'GET', path: (a) => path`/customers/${a.id}`, keep: true }),
  create: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/customers' }),
  update: endpoint<Id, unknown, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/customers/${a.id}` }),
  /**
   * What the caller owes clients today — the home Clients card. Its key carries
   * the member's own day, so yesterday's list can never answer for today. Kept
   * on purpose: a reminder owed at 14:00 is still owed with no signal.
   */
  due: endpoint<{ dayStart: string; dayEnd: string; limit?: number }, unknown>({
    method: 'GET',
    path: (q) => withQuery('/customers/due', q),
    keep: true,
  }),

  // ── activities ──
  activities: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/customers/${a.id}/activities`, keep: true }),
  addActivity: endpoint<Id, unknown, Record<string, unknown>>({
    method: 'POST',
    path: (a) => path`/customers/${a.id}/activities`,
  }),
  updateActivity: endpoint<Id & { activityId: string }, unknown, Record<string, unknown>>({
    method: 'PATCH',
    path: (a) => path`/customers/${a.id}/activities/${a.activityId}`,
  }),
  removeActivity: endpoint<Id & { activityId: string }, void>({
    method: 'DELETE',
    path: (a) => path`/customers/${a.id}/activities/${a.activityId}`,
  }),

  // ── contact people ──
  /** Who works at this company. */
  contacts: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/customers/${a.id}/contacts`, keep: true }),
  /** Which companies this person is a contact at. */
  companies: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/customers/${a.id}/companies`, keep: true }),
  /** Attach a person — existing (`personId`) or new (`person`). */
  addContact: endpoint<
    Id,
    unknown,
    { personId?: string; person?: Record<string, unknown>; role?: string; isPrimary?: boolean }
  >({
    method: 'POST',
    path: (a) => path`/customers/${a.id}/contacts`,
  }),
  updateContact: endpoint<{ linkId: string }, unknown, { role?: string; isPrimary?: boolean }>({
    method: 'PATCH',
    path: (a) => path`/customers/contacts/${a.linkId}`,
  }),
  /** Detach — the person record is kept. */
  removeContact: endpoint<{ linkId: string }, void>({
    method: 'DELETE',
    path: (a) => path`/customers/contacts/${a.linkId}`,
  }),
  /** Make a contact a client in their own right. */
  promote: endpoint<Id, unknown>({ method: 'POST', path: (a) => path`/customers/${a.id}/promote` }),

  // ── addresses ──
  addresses: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/customers/${a.id}/addresses`, keep: true }),
  addAddress: endpoint<Id, unknown, Record<string, unknown>>({
    method: 'POST',
    path: (a) => path`/customers/${a.id}/addresses`,
  }),
  updateAddress: endpoint<Id & { unitId: string }, unknown, Record<string, unknown>>({
    method: 'PATCH',
    path: (a) => path`/customers/${a.id}/addresses/${a.unitId}`,
  }),
  setPrimaryAddress: endpoint<Id & { unitId: string }, unknown>({
    method: 'POST',
    path: (a) => path`/customers/${a.id}/addresses/${a.unitId}/primary`,
  }),
  removeAddress: endpoint<Id & { unitId: string }, void>({
    method: 'DELETE',
    path: (a) => path`/customers/${a.id}/addresses/${a.unitId}`,
  }),

  // ── the client portal invitation ──
  invite: endpoint<Id, { code?: string; email?: string }, { email?: string; portalId?: string }>({
    method: 'POST',
    path: (a) => path`/customers/${a.id}/invite`,
  }),

  // ── clients from the phone's address book ──
  /** The organization's clients as HASHED keys — the phone marks "already a client" on the device. */
  matchKeys: endpoint<void, { hashes: string[]; complete: boolean }>({
    method: 'GET',
    path: () => '/customers/match-keys',
    keep: true,
  }),
  /** One transaction; online only — a queued import would promise clients the duplicate check has not seen. */
  importContacts: endpoint<void, ContactImportSummary, ContactImportBody>({
    method: 'POST',
    path: () => '/customers/import',
  }),
});
