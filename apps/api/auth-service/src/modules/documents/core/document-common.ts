/**
 * The personnel file's shared vocabulary: who the caller is, the visibility
 * rules every read answers, and the small pure helpers more than one part of
 * the documents service needs.
 *
 * Pure on purpose — nothing here touches the database or storage, so every
 * collaborator can use it without a dependency on any other.
 */
export {
  type DocumentActor,
  assertTypeVisible,
  typeScope,
  maySeeDrafts,
  assertNotHiddenDraft,
  type RequestContext,
  MAX_DOCUMENT_BYTES,
  CUSTOMER_LINK_STATUSES,
  CLIENT_STEP_WHERE,
  ABANDONED_DRAFT_DAYS,
  ALLOWED_MIME,
  type SignerCandidate,
  type RouteCandidateStep,
  type SealSigner,
} from '../common/actor';
export {
  assertUploadable,
  ownStagingPrefix,
  sharedStagingPrefix,
  assertStagingKey,
  assertNotOwnReview,
  assertCanIssue,
  assertCanManageTypes,
  assertCanManageVisibility,
} from '../common/rules';
export {
  CONSENT_TEXT,
  EMPLOYER_COMPANY_SELECT,
  type EmployerCompany,
  contractValues,
  type ContractTerms,
} from '../common/contract';
export {
  decodeSignaturePng,
  normaliseKey,
  cuidish,
  canRenderInline,
  roleLabel,
  downloadName,
  boundedIds,
  eventContext,
  sameIdSet,
} from '../common/helpers';
