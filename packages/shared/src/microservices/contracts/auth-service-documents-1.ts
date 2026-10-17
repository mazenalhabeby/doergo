/** Message contracts for auth-service `documents` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';
import type { Rect } from '../../documents/frame-crop';
import type { DocumentCadence, DocumentDirection, SignatureMode } from '../../documents/types';

/** What a caller is allowed to do, resolved by the gateway from their access. */
export interface DocumentActor {
  /**
   * Works for a client or partner, not for this organization.
   *
   * The personnel file is the one area where the answer is a relationship
   * rather than a permission: we ask somebody else's employee for nothing, and
   * we accept nothing from them either.
   */
  isExternal?: boolean;
  userId: string;
  organizationId: string;
  canViewMemberDocuments: boolean;
  canOpenMemberDocuments: boolean;
  canIssueDocuments: boolean;
  canManageDocumentTemplates: boolean;
  /** The member's org-wide role — a document TYPE may name the roles that see it. */
  roleId?: string | null;
  /** An administrator sees every type. */
  isAdmin?: boolean;
  canManageDocumentVisibility?: boolean;
  canReplaceDocuments?: boolean;
  canDeleteDocuments?: boolean;
}

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** The pure steps of `DocumentSupplyService.submitOwnDocument`, in the order it runs them. */
export interface SubmitOwnDocumentInput {
  actor: DocumentActor;
  stagingKey: string;
  typeId: string;
  title?: string;
  expiresOn?: string | null;
  /**
   * Whatever a scanner read off the document — the machine-readable zone as
   * text. Optional: most documents here have no zone at all.
   */
  mrzText?: string | null;
  /** The scanner's frame, as fractions of the photograph. */
  crop?: Rect | null;
  /** The reverse of a two-sided card, filed as part of the same document. */
  backStagingKey?: string | null;
  /**
   * Further sheets, in reading order — a plain multi-sheet upload.
   *
   * ⚠️ Not combinable with `backStagingKey`: a card has a reverse, a stack of
   * paper has a page 2, and letting both through would silently decide which
   * one won.
   */
  pageStagingKeys?: string[] | null;
  backCrop?: Rect | null;
  ctx?: RequestContext;
  /** Made on the phone: the same document sent twice is filed once. */
  id?: string;
}

/** Terms that are not on the member record and are supplied at issue time. */
export interface ContractTerms {
  startDate?: string;
  weeklyHours?: number | string;
  endDate?: string;
  siteName?: string;
  siteAddress?: string;
  rotation?: string;
}

export const documentsChain = rpc<{ actor: DocumentActor; documentId: string }>('documents_chain');
export const documentsRouteCandidates = rpc<{ actor: DocumentActor; memberId: string; typeId: string }>(
  'documents_route_candidates',
);
export const documentsSendBack = rpc<{
  actor: DocumentActor;
  documentId: string;
  reason: string;
  ctx?: RequestContext;
}>('documents_send_back');
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
export const documentsListTypes = rpc<{
  organizationId: string;
  includeInactive?: boolean;
  /**
   * The caller, for type visibility.
   *
   * ⚠️ `manage` skips the restriction: configuring types requires seeing all of
   * them, and it is `canManageDocumentTemplates` that grants it — you cannot
   * set who may see a type from a screen that hides it from you.
   */
  roleId?: string | null;
  isAdmin?: boolean;
  manage?: boolean;
  /** For the self-exemptions in `visibleTypeSelfWhere`. */
  userId?: string | null;
}>('documents_list_types');
export const documentsCreateType = rpc<{
  actor: DocumentActor;
  key: string;
  label: string;
  description?: string | null;
  cadence?: DocumentCadence;
  direction?: DocumentDirection;
  retentionMonths?: number | null;
  signatureMode?: SignatureMode;
  isCredential?: boolean;
  hasExpiry?: boolean;
  requiredForWorkflowIds?: string[];
  requiredFromAll?: boolean;
  requiredFromRoleIds?: string[];
  /** Roles that may SEE documents of this type. Empty = no restriction. */
  visibleToRoleIds?: string[];
  twoSided?: boolean;
  /** Sheets of paper rather than a card — refused together with twoSided. */
  multiPage?: boolean;
  scanShape?: string;
  position?: number;
  /**
   * The signing route: an ordered list of {role}, or null for one signature.
   *
   * ⚠️ This was missing here while `updateType` accepted it, so a type created
   * WITH a signing route was created without one — silently, since every other
   * field saved. The only way to get a route onto a new type was to create it,
   * reopen it, and set the route a second time.
   */
  signerRoute?: unknown;
}>('documents_create_type');
export const documentsUpdateType = rpc<{
  actor: DocumentActor;
  id: string;
  patch: Partial<{
    label: string;
    description: string | null;
    retentionMonths: number | null;
    signatureMode: SignatureMode;
    isCredential: boolean;
    hasExpiry: boolean;
    requiredForWorkflowIds: string[];
    requiredFromAll: boolean;
    requiredFromRoleIds: string[];
    /** Roles that may SEE documents of this type. Empty = no restriction. */
    visibleToRoleIds: string[];
    twoSided: boolean;
    /** Sheets of paper rather than a card — refused together with twoSided. */
    multiPage: boolean;
    scanShape: string;
    isActive: boolean;
    position: number;
    /** Ordered signer roles, or null to go back to a single signature. */
    signerRoute: unknown;
  }>;
}>('documents_update_type');
export const documentsDeactivateType = rpc<{ actor: DocumentActor; id: string }>('documents_deactivate_type');
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
export const documentsSetVisibility = rpc<{
  actor: DocumentActor;
  documentIds: string[];
  hiddenFromMember?: boolean;
  roleIds?: string[] | null;
  ctx?: RequestContext;
}>('documents_set_visibility');
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
export const documentsListTemplates = rpc<{ actor: DocumentActor; includeInactive?: boolean }>(
  'documents_list_templates',
);
export const documentsCreateTemplate = rpc<{
  actor: DocumentActor;
  typeId: string;
  name: string;
  body: string;
  appliesToRoleId?: string | null;
  appliesToPosition?: string | null;
  signatureMode?: SignatureMode;
  offerValidDays?: number | null;
}>('documents_create_template');
export const documentsUpdateTemplate = rpc<{
  actor: DocumentActor;
  id: string;
  patch: Partial<{
    name: string;
    body: string;
    appliesToRoleId: string | null;
    appliesToPosition: string | null;
    signatureMode: SignatureMode;
    offerValidDays: number | null;
    isActive: boolean;
  }>;
}>('documents_update_template');
export const documentsDeactivateTemplate = rpc<{ actor: DocumentActor; id: string }>('documents_deactivate_template');
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
