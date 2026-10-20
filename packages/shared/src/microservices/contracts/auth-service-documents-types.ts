/** auth-service documents: the message types its handlers read. */
import type { Rect } from '../../documents/frame-crop';

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
