/** Message contracts for auth-service `documents` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';
import type { Rect } from '../../documents/frame-crop';
import type { ContractTerms, DocumentActor, RequestContext, SubmitOwnDocumentInput } from './auth-service-documents-1';

export const documentsReject = rpc<{
  actor: DocumentActor;
  documentId: string;
  reason: string;
  ctx?: RequestContext;
}>('documents_reject');
export const documentsPresignOwnUpload = rpc<{
  actor: DocumentActor;
  typeId: string;
  mimeType: string;
  sizeBytes: number;
}>('documents_presign_own_upload');
export const documentsReadOwnUpload = rpc<{
  actor: DocumentActor;
  stagingKey: string;
  crop?: Rect | null;
  /** The reverse, for a card that carries its zone there. */
  backStagingKey?: string | null;
  backCrop?: Rect | null;
}>('documents_read_own_upload');
export const documentsSubmitOwn = rpc<SubmitOwnDocumentInput>('documents_submit_own');
export const documentsPreviewTemplate = rpc<{
  actor: DocumentActor;
  /** Omit to ask only for the values — the editor does this once per member. */
  body?: string;
  title?: string;
  memberId?: string;
}>('documents_preview_template');
export const documentsIssueFromTemplate = rpc<{
  actor: DocumentActor;
  userId: string;
  templateId?: string;
  /** Terms that are not on the member record. */
  contract?: ContractTerms;
  ctx?: RequestContext;
}>('documents_issue_from_template');
export const documentsConsent = rpc<{ actor: DocumentActor; documentId: string; ctx?: RequestContext }>(
  'documents_consent',
);
export const documentsSign = rpc<{
  actor: DocumentActor;
  documentId: string;
  /** PNG data URL from the signature pad. */
  signatureImage: string;
  idempotencyKey: string;
  sessionAuthenticatedAt?: string | null;
  ctx?: RequestContext;
}>('documents_sign');
export const documentsAcknowledge = rpc<{
  actor: DocumentActor;
  documentId: string;
  ctx?: RequestContext;
}>('documents_acknowledge');
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
export const documentsDeleteOwn = rpc<{ actor: DocumentActor; documentId: string }>('documents_delete_own');
export const documentsLinkOpen = rpc<{ token: string }>('documents_link_open');
export const documentsLinkFile = rpc<{ token: string; signerId: string }>('documents_link_file');
export const documentsLinkSign = rpc<{
  token: string;
  signerIds: string[];
  signatureImage: string;
  name: string;
  role?: string | null;
  idempotencyKey: string;
  ctx?: any;
}>('documents_link_sign');
export const documentsLinkReissue = rpc<{ email: string }>('documents_link_reissue');
