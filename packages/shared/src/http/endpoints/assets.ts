/**
 * Assets — the organization's property, custody, expenses, the logbook and
 * proposals. Gateway: modules/assets (assets, asset-categories, custody,
 * expenses, log, proposals, contracts).
 *
 * ⚠️ A driver never creates an asset: the `proposals` routes carry no
 * permission (the caller's own id is the boundary); creating stays behind
 * `canManageAssets` on accept / contracts.apply.
 */
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';
import type { ContractFields, PresignedUpload } from '../types';

type Id = { id: string };

export const assetsEndpoints = defineEndpoints('assets', {
  // ── the register ──
  list: endpoint<Record<string, string | number | boolean | undefined> | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/assets', q || undefined) }),
  get: endpoint<Id, unknown>({ method: 'GET', path: (a) => path`/assets/${a.id}` }),
  create: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/assets' }),
  update: endpoint<Id, unknown, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/assets/${a.id}` }),
  remove: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/assets/${a.id}` }),
  orphans: endpoint<void, unknown[]>({ method: 'GET', path: () => '/assets/orphans' }),
  usage: endpoint<void, unknown>({ method: 'GET', path: () => '/assets/usage' }),
  activities: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/assets/${a.id}/activities` }),
  addActivity: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/assets/${a.id}/activities` }),
  history: endpoint<Id & { scope?: string }, unknown[]>({ method: 'GET', path: ({ id, ...q }) => withQuery(path`/assets/${id}/history`, q) }),
  rows: endpoint<Id & { list?: string; [k: string]: string | number | undefined }, unknown[]>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/assets/${id}/rows`, q),
  }),
  addRow: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/assets/${a.id}/rows` }),
  updateRow: endpoint<Id & { rowId: string }, unknown, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/assets/${a.id}/rows/${a.rowId}` }),
  removeRow: endpoint<Id & { rowId: string }, void>({ method: 'DELETE', path: (a) => path`/assets/${a.id}/rows/${a.rowId}` }),
  money: endpoint<Id, unknown>({ method: 'GET', path: (a) => path`/assets/${a.id}/money` }),
  addMoney: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/assets/${a.id}/money` }),
  removeMoney: endpoint<Id & { entryId: string }, void>({ method: 'DELETE', path: (a) => path`/assets/${a.id}/money/${a.entryId}` }),

  // ── custody: who holds it ──
  /** What the CALLER holds — the phone's home. The filter IS the authorization. */
  mine: endpoint<void, { periods: unknown[]; canPropose?: boolean }>({ method: 'GET', path: () => '/assets/mine', keep: true }),
  custody: endpoint<Id, unknown>({ method: 'GET', path: (a) => path`/assets/${a.id}/custody`, keep: true }),
  /** Hand it over (empty `to` = take it back). */
  handOver: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/assets/${a.id}/custody` }),
  memberCustody: endpoint<{ memberId: string; open?: boolean }, unknown>({
    method: 'GET',
    path: ({ memberId, ...q }) => withQuery(path`/assets/custody/member/${memberId}`, q),
    keep: true,
  }),

  // ── expenses (authorised by custody on the RECEIPT'S date) ──
  expensePresign: endpoint<Id, PresignedUpload, { fileName: string; mimeType: string; occurredAt?: string }>({
    method: 'POST',
    path: (a) => path`/assets/${a.id}/expenses/presign`,
  }),
  expenseRead: endpoint<Id, unknown, { fileKey: string; occurredAt?: string }>({ method: 'POST', path: (a) => path`/assets/${a.id}/expenses/read` }),
  submitExpense: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/assets/${a.id}/expenses` }),
  myExpenses: endpoint<void, unknown[]>({ method: 'GET', path: () => '/assets/expenses/mine', keep: true }),
  pendingExpenses: endpoint<{ spaceId?: string } | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/assets/expenses/pending', q || undefined) }),
  reviewExpense: endpoint<{ entryId: string }, unknown, { decision: string; note?: string; [k: string]: unknown }>({
    method: 'POST',
    path: (a) => path`/assets/expenses/${a.entryId}/review`,
  }),
  /** Mint a link to one slip — never kept. */
  receiptUrl: endpoint<{ entryId: string }, { url: string }>({ method: 'POST', path: (a) => path`/assets/expenses/${a.entryId}/receipt-url` }),

  // ── the logbook ──
  log: endpoint<Id & Record<string, string | number | undefined>, unknown>({ method: 'GET', path: ({ id, ...q }) => withQuery(path`/assets/${id}/log`, q) }),
  logSummary: endpoint<Id & Record<string, string | number | undefined>, unknown>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/assets/${id}/log/summary`, q),
  }),
  logPresign: endpoint<Id, PresignedUpload, { logType: string; fileName: string; mimeType: string; occurredAt?: string }>({
    method: 'POST',
    path: (a) => path`/assets/${a.id}/log/presign`,
  }),
  addLog: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/assets/${a.id}/log` }),
  withdrawLog: endpoint<Id & { entryId: string }, { id: string }>({ method: 'DELETE', path: (a) => path`/assets/${a.id}/log/${a.entryId}` }),
  myLog: endpoint<{ assetId?: string; limit?: number } | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/assets/log/mine', q || undefined), keep: true }),
  dueMine: endpoint<void, { items: unknown[] }>({ method: 'GET', path: () => '/assets/log/due-mine', keep: true }),

  // ── a contract → create the thing, hand it over, retire the old one (all canManageAssets) ──
  contractRead: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/assets/contracts/read' }),
  contractPreview: endpoint<void, unknown, { kind: string; memberId?: string; fields: ContractFields; [k: string]: unknown }>({
    method: 'POST',
    path: () => '/assets/contracts/preview',
  }),
  contractApply: endpoint<void, unknown, { kind: string; memberId?: string; fields: ContractFields; [k: string]: unknown }>({
    method: 'POST',
    path: () => '/assets/contracts/apply',
  }),

  // ── a member sends a page in ──
  proposalUploadUrl: endpoint<void, PresignedUpload, { fileName: string; mimeType: string }>({ method: 'POST', path: () => '/assets/proposals/upload-url' }),
  raiseProposal: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/assets/proposals' }),
  myProposals: endpoint<void, unknown[]>({ method: 'GET', path: () => '/assets/proposals/mine', keep: true }),
  withdrawProposal: endpoint<Id, { id: string }>({ method: 'POST', path: (a) => path`/assets/proposals/${a.id}/withdraw` }),
  pendingProposals: endpoint<{ spaceId?: string } | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/assets/proposals/pending', q || undefined) }),
  acceptProposal: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/assets/proposals/${a.id}/accept` }),
  rejectProposal: endpoint<Id, unknown, { reason?: string }>({ method: 'POST', path: (a) => path`/assets/proposals/${a.id}/reject` }),
  proposalDocumentUrl: endpoint<Id, { url: string }>({ method: 'POST', path: (a) => path`/assets/proposals/${a.id}/document-url` }),
});

/** The kinds of thing an organization owns — the vocabulary every asset screen reads first. */
export const assetCategoriesEndpoints = defineEndpoints('assetCategories', {
  list: endpoint<{ spaceId?: string } | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/asset-categories', q || undefined), keep: true }),
  create: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/asset-categories' }),
  update: endpoint<Id, unknown, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/asset-categories/${a.id}` }),
  remove: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/asset-categories/${a.id}` }),
  types: endpoint<{ categoryId: string }, unknown[]>({ method: 'GET', path: (a) => path`/asset-categories/${a.categoryId}/types`, keep: true }),
  createType: endpoint<{ categoryId: string }, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/asset-categories/${a.categoryId}/types` }),
  updateType: endpoint<Id, unknown, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/asset-types/${a.id}` }),
  removeType: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/asset-types/${a.id}` }),
});
