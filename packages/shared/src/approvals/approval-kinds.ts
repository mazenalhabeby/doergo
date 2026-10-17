/**
 * ONE INBOX FOR EVERY DECISION — what waits for a person, wherever it came from.
 *
 * Thirteen kinds of decision lived in nine places on the web and a different
 * subset on the phone. The inbox does not replace them: it READS their existing
 * lists (each through its own route and guard, as the caller) and DECIDES
 * through their existing actions. This file is the one description both ends
 * share — what each kind is, who may decide it, how urgent it is, which
 * buttons it has, and which existing route each button calls.
 *
 * ⚠️ AUTHORITY IS NEVER DECIDED HERE. `decideKey` only says whether to SHOW
 * the buttons; the existing route re-checks everything when it is called. A
 * mismatch can hide a button, never grant one.
 *
 * Pure: no IO. The gateway builds items with it; web and phone render and
 * decide with it.
 */
export {
  APPROVAL_KINDS,
  type ApprovalKind,
  isApprovalKind,
  APPROVAL_GROUPS,
  type ApprovalGroup,
  type ApprovalItem,
  type ApprovalsResponse,
  type ApprovalsCount,
  type ApprovalActionId,
  type ApprovalActionSpec,
  type ApprovalKindSpec,
  APPROVAL_KIND_SPECS,
  sortApprovals,
  countApprovals,
} from './kinds/kind-specs';
export { type ApprovalDecision, type ApprovalRoute, approvalRoute, approvalWebPath } from './kinds/kind-routes';
