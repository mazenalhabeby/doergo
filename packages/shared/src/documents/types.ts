/**
 * The personnel file — types shared by every service and both clients.
 *
 * A member's documents are the things the company issues TO them (payslip,
 * contract, annual statement) and the things they supply BACK (driving licence,
 * safety certificate). Both live in one store, because they are the same object
 * with the arrow pointing the other way — but they obey opposite rules, and the
 * `direction` field is what carries that difference everywhere downstream.
 *
 * Nothing in this file performs I/O. It is the vocabulary; the storage and the
 * service layers are elsewhere, and both depend on this rather than each other.
 */

/** How often a document type produces a new document. Drives the list UI. */
export type DocumentCadence = 'MONTHLY' | 'ANNUAL' | 'ONE_OFF';

/**
 * Who produced the document, which decides who may delete it.
 *
 * ISSUED  — company → member. The member can read and download, never delete.
 *           A payslip they could remove is not a record of anything.
 * SUPPLIED — member → company. The member owns it and may replace it; the
 *           company verifies it.
 */
export type DocumentDirection = 'ISSUED' | 'SUPPLIED';

/**
 * What the member has to do before a document counts as dealt with.
 *
 * NONE        — nothing; reading is enough (a payslip).
 * ACKNOWLEDGE — a recorded "I have read this" with no drawn signature
 *               (a safety policy). Legally weaker than a signature and honest
 *               about it — it is an attestation of receipt, not of agreement.
 * IN_APP      — consent + drawn signature + seal. The contract path.
 * WET_INK     — refuses in-app signing outright. Some contract types are
 *               excluded from electronic form by law (in Germany, fixed-term
 *               contracts and terminations); for those the system must decline
 *               rather than produce something that looks valid and is not.
 */
export type SignatureMode = 'NONE' | 'ACKNOWLEDGE' | 'IN_APP' | 'WET_INK';

/** Lifecycle of one document. */
export type DocumentStatus =
  | 'DRAFT' // staged in a batch, not yet published — invisible to the member
  | 'ISSUED' // published; the member can see it
  | 'AWAITING_SIGNATURE' // issued and blocking: needs consent + signature
  | 'SIGNED' // signed and sealed; frozen forever
  | 'EXPIRED' // a credential past its expiry date
  | 'SUPERSEDED' // replaced by a newer document (see Document.supersedesId)
  | 'REVOKED'; // withdrawn by the issuer

/**
 * The evidence trail. Append-only: every entry is a fact that happened at a
 * point in time, so there is no update path and no service method exposes one.
 */
export type DocumentEventType =
  | 'ISSUED'
  | 'DELIVERED' // notification accepted for delivery
  | 'OPENED' // a download URL was minted for the member
  | 'DOWNLOADED'
  | 'CONSENTED' // "I agree to sign electronically" — its own act
  | 'SIGNED'
  | 'SEALED' // certificate appended, bytes frozen
  | 'ACKNOWLEDGED'
  | 'VERIFIED' // an admin confirmed a supplied credential is genuine
  | 'REVOKED'
  | 'SUPERSEDED';

/** A document type, defined per organization. */
export interface DocumentTypeDef {
  id: string;
  organizationId: string;
  /** Stable machine key, unique per org: 'payslip', 'employment_contract'. */
  key: string;
  label: string;
  description?: string | null;
  cadence: DocumentCadence;
  direction: DocumentDirection;
  /**
   * How long the document must be kept after it is issued, in months.
   * Retention is a property of the TYPE, not a global setting — Austrian
   * employee records run ~3 years after termination, payroll far longer, and a
   * written reference must be producible for 30. One global rule would be
   * wrong for almost everything.
   */
  retentionMonths: number | null;
  signatureMode: SignatureMode;
  /** Credentials expire and gate dispatch; ordinary documents do neither. */
  isCredential: boolean;
  hasExpiry: boolean;
  /** Task types this credential is required for. Empty = gates nothing. */
  requiredForWorkflowIds: string[];
  isActive: boolean;
  position: number;
}

/** One document belonging to one member. */
export interface MemberDocument {
  id: string;
  organizationId: string;
  userId: string;
  typeId: string;
  title: string;
  /** Present only for cadenced types; drives the year/month grouping. */
  periodYear: number | null;
  periodMonth: number | null;
  /** Content-addressed object key. Never a URL — see object-store.ts. */
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  status: DocumentStatus;
  issuedById: string | null;
  issuedAt: string;
  deliveredAt: string | null;
  firstOpenedAt: string | null;
  expiresOn: string | null;
  retentionUntil: string | null;
  supersedesId: string | null;
  templateId: string | null;
}

/** What a list endpoint returns — metadata only, deliberately no URL. */
export interface MemberDocumentListItem
  extends Pick<
    MemberDocument,
    | 'id'
    | 'title'
    | 'typeId'
    | 'periodYear'
    | 'periodMonth'
    | 'status'
    | 'sizeBytes'
    | 'mimeType'
    | 'issuedAt'
    | 'expiresOn'
  > {
  typeKey: string;
  typeLabel: string;
  /** The member has not opened it yet. Drives the unread dot. */
  unread: boolean;
  /** Needs consent + signature before it stops blocking. */
  needsSignature: boolean;
}

/** One line of the evidence trail. */
export interface DocumentEventRecord {
  id: string;
  documentId: string;
  type: DocumentEventType;
  at: string;
  actorId: string | null;
  ip: string | null;
  userAgent: string | null;
  appVersion: string | null;
  lat: number | null;
  lng: number | null;
  meta: Record<string, unknown> | null;
}

/**
 * Everything captured at the moment of signing.
 *
 * A drawn squiggle on its own is the weakest tier eIDAS recognises. What lifts
 * it is this record: the signature linked to an identified signer who was under
 * sole control, with any later change to the document detectable. The hash pair
 * is the last of those four — if `hashAfter` still matches the stored bytes,
 * the document provably has not been altered since it was sealed.
 */
export interface DocumentSignatureRecord {
  id: string;
  documentId: string;
  userId: string;
  signatureKey: string;
  signatureSha256: string;
  consentText: string;
  consentAt: string;
  signedAt: string;
  hashBefore: string;
  hashAfter: string;
  sealedAt: string | null;
}

/** Where a credential stands right now. */
export type CredentialStanding = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING';
