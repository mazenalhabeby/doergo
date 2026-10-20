/** auth-service documents: the register — issue, file, check, revoke, delete, compliance, links to open, history, export. */
import { rpc } from '../contract';
import type { DocumentActor, RequestContext } from './auth-service-documents-types';

export const documentsBrowse = rpc<{
  actor: DocumentActor;
  groupBy?: 'type' | 'member' | 'year';
  typeId?: string;
  userId?: string;
  year?: number | null;
  /** Explicitly at the undated folder, which is not the same as "no filter". */
  undated?: boolean;
}>('documents_browse');

export const documentsListIssued = rpc<{
  actor: DocumentActor;
  tab?: 'awaiting' | 'unopened' | 'signed' | 'all';
  typeId?: string;
  userId?: string;
  year?: number;
  search?: string;
  page?: number;
  limit?: number;
}>('documents_list_issued');

export const documentsPresignUpload = rpc<{
  actor: DocumentActor;
  userId: string;
  typeId: string;
  mimeType: string;
  sizeBytes: number;
}>('documents_presign_upload');

export const documentsConfirmUpload = rpc<{
  /** Chosen signer per route step, where the step had more than one candidate. */
  signerChoices?: Array<{ order: number; userId?: string | null; customerId?: string | null }>;
  actor: DocumentActor;
  stagingKey: string;
  userId: string;
  typeId: string;
  title: string;
  periodYear?: number | null;
  periodMonth?: number | null;
  expiresOn?: string | null;
  /*
      Stage instead of publish.

      A payroll batch confirms thirty files one at a time — the browser drives
      it, so each upload/hash/store round trip is its own small request and a
      failure is isolated to one row. They land as DRAFT: invisible to the
      member, and no notification is sent. `publishBatch` releases them all at
      once, which is the only moment anything becomes visible.

      This is why there is no job queue here. The expensive work is already
      spread across many requests; a queue would only move the same work
      somewhere it is harder to watch.
    */
  asDraft?: boolean;
  /**
   * Replace this document with the new one: the old one is SUPERSEDED and
   * hidden from its member, so they see only the version they are now asked
   * to sign. Its record, signatures included, stays with the organization.
   */
  replacesId?: string | null;
  ctx?: RequestContext;
}>('documents_confirm_upload');

export const documentsRevoke = rpc<{ actor: DocumentActor; documentId: string; ctx?: RequestContext }>(
  'documents_revoke',
);

export const documentsDelete = rpc<{
  actor: DocumentActor;
  documentIds: string[];
  confirmSignaturesLost?: boolean;
  ctx?: RequestContext;
}>('documents_delete');

export const documentsCompliance = rpc<{
  organizationId: string;
  scopeSpaceIds?: string[];
  /**
   * Who is reading — the gateway's `documentActor(user)` fits. A restricted
   * credential type stays off the board for a reader who may not see it.
   *
   * ⚠️ Absent fails CLOSED: read as a member with no role, who sees only the
   * unrestricted types. Never as an administrator.
   */
  actor?: { userId?: string | null; roleId?: string | null; isAdmin?: boolean };
}>('documents_compliance');

export const documentsListRequirements = rpc<{ actor: DocumentActor; targetUserId?: string }>(
  'documents_list_requirements',
);

export const documentsPendingForMember = rpc<{ actor: DocumentActor }>('documents_pending_for_member');

export const documentsAwaitingVerification = rpc<{ actor: DocumentActor }>('documents_awaiting_verification');

export const documentsVerify = rpc<{
  actor: DocumentActor;
  documentId: string;
  /** Supplied here when the member's upload could not be read — "YYYY-MM-DD". */
  expiresOn?: string | null;
  ctx?: RequestContext;
}>('documents_verify');

export const documentsReject = rpc<{
  actor: DocumentActor;
  documentId: string;
  reason: string;
  ctx?: RequestContext;
}>('documents_reject');

export const documentsMatchCandidates = rpc<{ actor: DocumentActor }>('documents_match_candidates');

export const documentsListDrafts = rpc<{ actor: DocumentActor }>('documents_list_drafts');

export const documentsPublishBatch = rpc<{
  actor: DocumentActor;
  documentIds: string[];
  /*
      Chosen signers, per document, for steps whose route left a choice.

      Carried at publish rather than at upload because the chain is built at
      publish — and because a draft may sit for days between the two, during
      which the answer could change.
    */
  signerChoices?: Array<{
    documentId: string;
    choices: Array<{ order: number; userId?: string | null; customerId?: string | null }>;
  }>;
  ctx?: RequestContext;
}>('documents_publish_batch');

export const documentsDiscardDraft = rpc<{ actor: DocumentActor; documentId: string }>('documents_discard_draft');

export const documentsListForMember = rpc<{
  actor: DocumentActor;
  targetUserId?: string;
  typeId?: string;
  year?: number;
  search?: string;
  includeArchived?: boolean;
}>('documents_list_for_member');

export const documentsDownloadUrl = rpc<{ actor: DocumentActor; documentId: string; ctx?: RequestContext }>(
  'documents_download_url',
);

export const documentsListEvents = rpc<{ actor: DocumentActor; documentId: string }>('documents_list_events');

export const documentsExport = rpc<{
  actor: DocumentActor;
  targetUserId?: string;
  ctx?: RequestContext;
}>('documents_export');
