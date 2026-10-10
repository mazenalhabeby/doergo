/**
 * The personnel file. Gateway: modules/documents (documents.controller.ts,
 * sign-link.controller.ts).
 *
 * ⚠️ No list returns a URL: minting a link (`downloadUrl`) IS the "opened"
 * event. Signed links are credentials, so nothing that mints one is kept offline.
 */
import type { MemberDocument } from '../../documents/types';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';

type Id = { id: string };

export interface DocumentChainStep {
  order: number;
  role: string;
  status: 'PENDING' | 'SIGNED' | 'SKIPPED';
  name: string | null;
  signedAt: string | null;
  isYou: boolean;
}

/** `GET /documents/:id/chain` — who has signed, step by step. */
export interface DocumentChainView {
  documentId: string;
  title: string;
  steps: DocumentChainStep[];
  total: number;
  signed: number;
  complete: boolean;
  currentOrder: number | null;
}

export interface DocumentUploadSlot {
  uploadUrl: string;
  [key: string]: unknown;
}

export const documentsEndpoints = defineEndpoints('documents', {
  // ── the catalogue ──
  types: endpoint<{ includeInactive?: boolean } | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/documents/types', q || undefined), keep: true }),
  createType: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/documents/types' }),
  updateType: endpoint<Id, unknown, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/documents/types/${a.id}` }),
  deactivateType: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/documents/types/${a.id}` }),
  visibilityRoles: endpoint<void, Array<{ id: string; name: string; color: string | null }>>({ method: 'GET', path: () => '/documents/visibility-roles', keep: true }),

  // ── reading ──
  /** The member's own list, or (with `userId` and the permission) somebody's. */
  list: endpoint<{ userId?: string; typeId?: string; year?: number; search?: string } | void, MemberDocument[]>({
    method: 'GET',
    path: (q) => withQuery('/documents', q || undefined),
    keep: true,
  }),
  browse: endpoint<{ groupBy?: 'type' | 'member' | 'year'; typeId?: string; userId?: string; year?: number; undated?: boolean }, unknown>({
    method: 'GET',
    path: (q) => withQuery('/documents/browse', { ...q, undated: q.undated ? 'true' : undefined }),
    keep: true,
  }),
  /** The issued register. `/sent` is the API path and stays — renaming a live endpoint 404s for every installed app. */
  sent: endpoint<{ tab?: 'awaiting' | 'unopened' | 'signed' | 'all'; typeId?: string; userId?: string; year?: number; search?: string; page?: number; limit?: number } | void, unknown>({
    method: 'GET',
    path: (q) => withQuery('/documents/sent', q || undefined),
    keep: true,
  }),
  chain: endpoint<Id, DocumentChainView>({ method: 'GET', path: (a) => path`/documents/${a.id}/chain`, keep: true }),
  /** Mint a link — the "opened" event. Never kept. */
  downloadUrl: endpoint<Id, { url: string; fileName: string }>({ method: 'POST', path: (a) => path`/documents/${a.id}/download-url` }),
  requirements: endpoint<{ userId?: string } | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/documents/requirements', q || undefined), keep: true }),
  pending: endpoint<void, unknown>({ method: 'GET', path: () => '/documents/pending', keep: true }),
  compliance: endpoint<void, unknown[]>({ method: 'GET', path: () => '/documents/compliance', keep: true }),
  matchCandidates: endpoint<void, unknown[]>({ method: 'GET', path: () => '/documents/match-candidates' }),

  // ── issuing (presign, then file it) ──
  uploadUrl: endpoint<void, DocumentUploadSlot, { userId: string; typeId: string; mimeType: string; sizeBytes: number }>({
    method: 'POST',
    path: () => '/documents/upload-url',
  }),
  create: endpoint<void, MemberDocument, Record<string, unknown>>({ method: 'POST', path: () => '/documents' }),
  awaitingVerification: endpoint<void, unknown[]>({ method: 'GET', path: () => '/documents/awaiting-verification', keep: true }),
  verify: endpoint<Id, unknown, { expiresOn?: string | null }>({ method: 'POST', path: (a) => path`/documents/${a.id}/verify` }),
  reject: endpoint<Id, unknown, { reason: string }>({ method: 'POST', path: (a) => path`/documents/${a.id}/reject` }),
  remove: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/documents/${a.id}` }),
  setVisibility: endpoint<void, { updated: number }, { documentIds: string[]; hiddenFromMember?: boolean; roleIds?: string[] | null }>({
    method: 'POST',
    path: () => '/documents/bulk/visibility',
  }),
  removeMany: endpoint<void, { deleted: number }, { documentIds: string[]; confirmSignaturesLost?: boolean }>({ method: 'POST', path: () => '/documents/bulk/delete' }),
  export: endpoint<void, unknown, { userId?: string }>({ method: 'POST', path: () => '/documents/export' }),
  drafts: endpoint<void, unknown[]>({ method: 'GET', path: () => '/documents/drafts' }),
  publish: endpoint<void, { published: number }, Record<string, unknown>>({ method: 'POST', path: () => '/documents/publish' }),
  discardDraft: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/documents/drafts/${a.id}` }),

  // ── a member supplying their own ──
  ownUploadUrl: endpoint<void, DocumentUploadSlot, { typeId: string; mimeType: string; sizeBytes: number }>({ method: 'POST', path: () => '/documents/mine/upload-url' }),
  readOwnUpload: endpoint<void, unknown, { stagingKey: string; [k: string]: unknown }>({ method: 'POST', path: () => '/documents/mine/read' }),
  submitOwn: endpoint<void, MemberDocument, Record<string, unknown>>({ method: 'POST', path: () => '/documents/mine' }),

  // ── the signing chain ──
  consent: endpoint<Id, { consentText: string; consentAt: string }>({ method: 'POST', path: (a) => path`/documents/${a.id}/consent` }),
  sign: endpoint<Id, { documentId: string; alreadySigned: boolean }, { signatureImage: string; idempotencyKey: string; [k: string]: unknown }>({
    method: 'POST',
    path: (a) => path`/documents/${a.id}/sign`,
  }),
  acknowledge: endpoint<Id, { success: boolean }>({ method: 'POST', path: (a) => path`/documents/${a.id}/acknowledge` }),

  // ── contract templates ──
  templates: endpoint<{ includeInactive?: boolean } | void, unknown[]>({ method: 'GET', path: (q) => withQuery('/documents/templates', q || undefined) }),
  createTemplate: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/documents/templates' }),
  previewTemplate: endpoint<void, unknown, { body?: string; title?: string; memberId?: string }>({ method: 'POST', path: () => '/documents/templates/preview' }),
  updateTemplate: endpoint<Id, unknown, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/documents/templates/${a.id}` }),
  deactivateTemplate: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/documents/templates/${a.id}` }),
});

/** A CLIENT signing from an emailed link — no session; the token in the body is the authority. */
export const signLinkEndpoints = defineEndpoints('signLink', {
  open: endpoint<void, unknown, { token: string }>({ method: 'POST', path: () => '/documents/sign', public: true }),
  file: endpoint<void, { ok: boolean; url?: string }, { token: string; signerId: string }>({ method: 'POST', path: () => '/documents/sign/file', public: true }),
  submit: endpoint<void, { ok: boolean; signed: number; failed: unknown[] }, Record<string, unknown>>({
    method: 'POST',
    path: () => '/documents/sign/submit',
    public: true,
  }),
  resend: endpoint<void, unknown, { email: string }>({ method: 'POST', path: () => '/documents/sign/resend', public: true }),
});
