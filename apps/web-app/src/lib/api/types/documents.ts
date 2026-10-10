

// ============================================================================
// DOCUMENTS API — the personnel file
// ============================================================================

export interface RequirementRow {
  typeId: string;
  label: string;
  state: 'MISSING' | 'AWAITING_REVIEW' | 'REJECTED' | 'MET' | 'EXPIRING' | 'EXPIRED';
  expiresOn: string | null;
  blocksWork: boolean;
}


/** What the signed-in member still has to do, of either kind. */
export interface PendingDocumentsSummary {
  toUpload: RequirementRow[]
  expiring: RequirementRow[]
  /*
    `forMember` names the person the document is about, and is set only when
    that is somebody other than you — a responsible countersigning a worker's
    time sheet. Null on your own documents.
  */
  toSign: { id: string; title: string; forMember?: string | null }[]
}


export interface PendingReviewRow {
  id: string;
  title: string;
  submittedAt: string;
  expiresOn: string | null;
  sizeBytes: number;
  mimeType: string;
  member: { id: string; firstName: string; lastName: string };
  typeId: string;
  typeLabel: string;
  isCredential: boolean;
  /** Somebody is out of the assignable pool until this is approved. */
  blocksWork: boolean;
  standing: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING' | null;
  /** Present only when the document was scanned rather than photographed. */
  scanFormat: string | null;
  scanVerdict: 'CONSISTENT' | 'UNVERIFIED' | 'SUSPECT' | null;
  scanChecks: { id: string; outcome: 'PASS' | 'FAIL' | 'WARN' | 'SKIP'; detail?: string }[] | null;
  holderName: string | null;
  documentNumber: string | null;
  /** Accept needs a date when this is true and `expiresOn` is empty. */
  hasExpiry: boolean;
  issuingState: string | null;
  /** What the background reader found; null until the document has been read. */
  reading: {
    expiresOn: string | null;
    certainty: 'PROVEN' | 'SUGGESTED' | null;
    source: 'MRZ' | 'BARCODE' | 'LABEL' | 'TEXT' | null;
    label: string | null;
    unreadable: 'HEIC' | 'NOT_AN_IMAGE' | 'NO_TEXT' | null;
  } | null;
}


export interface MemberDocumentRow {
  id: string;
  title: string;
  typeId: string;
  typeKey: string;
  typeLabel: string;
  periodYear: number | null;
  periodMonth: number | null;
  status: string;
  sizeBytes: number;
  mimeType: string;
  issuedAt: string;
  expiresOn: string | null;
  unread: boolean;
  needsSignature: boolean;
  /** Their own upload (nobody issued it) — on an "either" type, the copy they may replace. */
  suppliedByMember?: boolean;
  standing: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING' | null;
  /**
   * Whose document this is, when it is not yours.
   *
   * Set only on a document waiting on your signature that belongs to somebody
   * else — a responsible countersigning a worker's time sheet. Null on your
   * own, where naming the person would be naming the reader.
   */
  forMember?: string | null
  /** Why a reviewer refused something the member supplied. */
  rejectionReason?: string | null;
}


export interface DocumentTypeRow {
  id: string;
  key: string;
  label: string;
  description: string | null;
  cadence: 'MONTHLY' | 'ANNUAL' | 'ONE_OFF';
  direction: 'ISSUED' | 'SUPPLIED' | 'BOTH';
  retentionMonths: number | null;
  signatureMode: 'NONE' | 'ACKNOWLEDGE' | 'IN_APP' | 'WET_INK';
  isCredential: boolean;
  hasExpiry: boolean;
  requiredForWorkflowIds: string[];
  /** Every member must provide one. */
  requiredFromAll: boolean;
  /** Only members holding one of these roles must. */
  requiredFromRoleIds: string[];
  /**
   * Who may SEE documents of this type. Empty means no restriction, which is
   * what every type is until somebody names roles here. Administrators are
   * never restricted.
   */
  visibleToRoleIds: string[];
  /** The scanner asks for the back as well — ID cards and licences, not passports. */
  twoSided: boolean;
  /** Sheets of paper rather than a card — never set together with twoSided. */
  multiPage?: boolean;
  /** The frame the scanner draws: a passport page is not the shape of a card. */
  scanShape: 'CARD' | 'PASSPORT' | 'PAGE';
  isActive: boolean;
  position: number;
  /**
   * The signing route: an ordered list of {role}, or null for one signature.
   *
   * Deliberately loose here. The shape is owned and validated by the server —
   * a second definition on the client is a second place for it to be wrong.
   */
  signerRoute?: Array<{ role: string }> | null
}


export interface MatchCandidateRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** For resolving which members a contract template would reach. */
  memberRoleId?: string | null;
  position?: string | null;
}


export interface DraftDocumentRow {
  id: string;
  title: string;
  periodYear: number | null;
  periodMonth: number | null;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
  type: { id: string; label: string; signatureMode: string };
  /**
   * The route resolved for THIS member, when the type has one.
   *
   * Null for a type with no route. A step with one candidate needs no question;
   * a step with several is what the picker is for; a step with none becomes a
   * skipped step rather than blocking the publish.
   */
  routeSteps?: RouteCandidateStep[] | null;
}


/** One person or client a route step could resolve to. */
interface SignerCandidate {
  /** CONTACT is a client space's own contact — an address with no client row. */
  kind: "USER" | "CUSTOMER" | "CONTACT";
  id: string;
  name: string;
  email: string | null;
}


export interface RouteCandidateStep {
  order: number;
  role: string;
  candidates: SignerCandidate[];
}


/** One row of the issued-document register. Carries no url, by design. */
export interface IssuedRow {
  id: string
  title: string
  status: string
  periodYear: number | null
  periodMonth: number | null
  issuedAt: string
  openedAt: string | null
  signedAt: string | null
  expiresOn: string | null
  sizeBytes: number
  mimeType: string
  memberId: string
  memberName: string
  typeId: string
  typeLabel: string
  signatureMode: string
  isCredential: boolean
  /** Null for a document whose type has no route — not an empty chain. */
  chain?: DocumentChain | null
  /** Hidden from the member it belongs to ("Who can see this"). */
  hiddenFromMember?: boolean
  /** True when `visibleToRoleIds` replaces the type's rule for this document. */
  rolesOverridden?: boolean
  visibleToRoleIds?: string[]
  signatureCount?: number
}


/** A folder in the cabinet: a type, a member, or a year. */
export interface BrowseFolder {
  kind: "type" | "member" | "year"
  key: string
  /** Null for the undated folder, which the client names in the user's language. */
  label: string | null
  undated: boolean
  count: number
}


export interface BrowseLevel {
  groupBy: "type" | "member" | "year"
  level: "type" | "member" | "year" | "documents"
  folders: BrowseFolder[]
  documents: IssuedRow[]
}


/** Where a document has got to, when its type has a signing route. */
export interface DocumentChain {
  total: number
  signed: number
  complete: boolean
  currentOrder: number | null
  currentRole: string | null
  waitingOn: string | null
  /** When the current signer was told. Null if they have not been notified. */
  waitingSince: string | null
}


export interface IssuedRegister {
  rows: IssuedRow[]
  page: number
  limit: number
  total: number
  counts: { awaiting: number; unopened: number; signed: number; all: number }
}


export interface ComplianceRow {
  id: string;
  title: string;
  expiresOn: string | null;
  member: { id: string; firstName: string; lastName: string };
  credential: string;
  standing: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING';
  daysLeft: number | null;
  /** True only when a LAPSED credential actually gates a task type. */
  blocksDispatch: boolean;
  gatesTaskTypes: string[];
}


export interface ContractTemplateRow {
  id: string;
  name: string;
  body: string;
  typeId: string;
  type: { id: string; label: string };
  appliesToRoleId: string | null;
  appliesToRole: { id: string; name: string; slug: string } | null;
  appliesToPosition: string | null;
  signatureMode: 'NONE' | 'ACKNOWLEDGE' | 'IN_APP' | 'WET_INK';
  offerValidDays: number | null;
  version: number;
  isActive: boolean;
}


export interface TemplatePreview {
  /** The PDF, base64. Null when only the values were asked for. */
  pdf: string | null;
  /** Every merge field resolved for one real member; '—' where the record is blank. */
  values: Record<string, string>;
  filledFor: string | null;
  missing: string[];
}
