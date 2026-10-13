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
import type { AccessPermissionKey } from '../types/permissions';

export const APPROVAL_KINDS = [
  'hours',
  'away',
  'extraTime',
  'overtime',
  'request',
  'noShow',
  'issue',
  'expense',
  'assetProposal',
  'document',
  'join',
  'clientRequest',
  'guestRequest',
] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export function isApprovalKind(v: unknown): v is ApprovalKind {
  return typeof v === 'string' && (APPROVAL_KINDS as readonly string[]).includes(v);
}

/** How soon: somebody is waiting on the spot · it changes today · everything else. */
export const APPROVAL_GROUPS = ['NOW', 'TODAY', 'LATER'] as const;
export type ApprovalGroup = (typeof APPROVAL_GROUPS)[number];

/** One thing waiting for a decision, as both apps render it. */
export interface ApprovalItem {
  kind: ApprovalKind;
  /** The id the existing action route takes. */
  id: string;
  /** Who it is about (the member, the client, the joiner). */
  subject: { id: string | null; name: string; avatarUrl?: string | null };
  space: { id: string; name: string } | null;
  /** When it was raised; ISO. */
  raisedAt: string | null;
  /** When it stops mattering or must be answered by (shift end, start date, timeout); ISO. */
  dueAt: string | null;
  group: ApprovalGroup;
  /** The caller may press the buttons. False = shown read-only (they may see it, not decide it). */
  canDecide: boolean;
  /**
   * Kind-specific facts, flat and serialisable — rendered by each app's own
   * words for the kind (see `approvalFacts`). Never a sentence.
   */
  data: Record<string, string | number | boolean | null>;
}

export interface ApprovalsResponse {
  items: ApprovalItem[];
  /** Kinds whose list could not be read just now — the rest is still shown. */
  unavailable: ApprovalKind[];
  generatedAt: string;
}

export interface ApprovalsCount {
  total: number;
  /** Of which NOW — somebody waiting on the spot. */
  now: number;
  byKind: Partial<Record<ApprovalKind, number>>;
}

/* ------------------------------------------------------------------ buttons */

export type ApprovalActionId = 'approve' | 'reject';

export interface ApprovalActionSpec {
  id: ApprovalActionId;
  /** What the button says (each app's own words per kind+action). */
  labelKey: string;
  tone: 'primary' | 'neutral' | 'danger';
  /** A reason the member reads. */
  reason: 'required' | 'optional' | 'none';
  /** An extra value the decision needs. */
  input?: 'minutes' | 'expiresOn';
}

export interface ApprovalKindSpec {
  /** The permission the existing action route checks (for showing the buttons only). */
  decideKey: AccessPermissionKey;
  /** The route checks it org-wide, not in a workspace. */
  orgWide: boolean;
  actions: ApprovalActionSpec[];
  /**
   * Some decisions need the full page (a client request becomes a job with a
   * workflow; an asset proposal needs a kind). The inbox opens it instead of
   * pressing a button it cannot fill.
   */
  needsPage?: (item: ApprovalItem) => boolean;
}

const approve = (labelKey: string, extra: Partial<ApprovalActionSpec> = {}): ApprovalActionSpec => ({ id: 'approve', labelKey, tone: 'primary', reason: 'none', ...extra });
const reject = (labelKey: string, reason: ApprovalActionSpec['reason']): ApprovalActionSpec => ({ id: 'reject', labelKey, tone: 'danger', reason });

export const APPROVAL_KIND_SPECS: Record<ApprovalKind, ApprovalKindSpec> = {
  hours: { decideKey: 'canApproveAttendance', orgWide: false, actions: [approve('approve'), reject('reject', 'required')] },
  away: { decideKey: 'canApproveAttendance', orgWide: false, actions: [approve('allow'), reject('notAllowed', 'none')] },
  extraTime: { decideKey: 'canApproveOvertime', orgWide: false, actions: [approve('give', { input: 'minutes' }), reject('reject', 'optional')] },
  overtime: { decideKey: 'canApproveOvertime', orgWide: false, actions: [approve('approve', { input: 'minutes' }), reject('reject', 'required')] },
  request: { decideKey: 'canManageRota', orgWide: false, actions: [approve('approve'), reject('reject', 'optional')] },
  noShow: { decideKey: 'canReconcileAttendance', orgWide: false, actions: [approve('excuse', { reason: 'optional' })] },
  issue: { decideKey: 'canReconcileAttendance', orgWide: false, actions: [approve('acknowledge')] },
  expense: { decideKey: 'canManageAssets', orgWide: false, actions: [approve('accept'), reject('reject', 'optional')] },
  assetProposal: {
    decideKey: 'canManageAssets',
    orgWide: false,
    actions: [approve('accept'), reject('reject', 'optional')],
    // Accepting creates the asset: without a kind it needs the page's form.
    needsPage: (i) => !i.data.categoryId,
  },
  document: {
    decideKey: 'canIssueDocuments',
    orgWide: true,
    actions: [approve('verify', { input: 'expiresOn' }), reject('reject', 'required')],
  },
  join: { decideKey: 'canManageUsers', orgWide: true, actions: [approve('accept'), reject('reject', 'optional')] },
  clientRequest: {
    decideKey: 'canAnswerPortal',
    orgWide: false,
    actions: [approve('turnIntoJob')],
    // A job needs a workspace: the request's, else the suggested one, else the page.
    needsPage: (i) => !i.space && !i.data.suggestedSpaceId,
  },
  guestRequest: { decideKey: 'canManageWorkspaces', orgWide: true, actions: [approve('approve'), reject('reject', 'none')] },
};

/* ------------------------------------------------------------------ order */

const GROUP_RANK: Record<ApprovalGroup, number> = { NOW: 0, TODAY: 1, LATER: 2 };

/** Now first; inside a group, the one that runs out first, then the one waiting longest. */
export function sortApprovals(items: ApprovalItem[]): ApprovalItem[] {
  const t = (s: string | null) => (s ? new Date(s).getTime() : Number.POSITIVE_INFINITY);
  return [...items].sort(
    (a, b) =>
      GROUP_RANK[a.group] - GROUP_RANK[b.group] ||
      t(a.dueAt) - t(b.dueAt) ||
      t(a.raisedAt) - t(b.raisedAt),
  );
}

export function countApprovals(items: readonly ApprovalItem[]): ApprovalsCount {
  const byKind: Partial<Record<ApprovalKind, number>> = {};
  let now = 0;
  for (const i of items) {
    byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
    if (i.group === 'NOW') now++;
  }
  return { total: items.length, now, byKind };
}

/* ------------------------------------------------------------------ deciding */

export interface ApprovalDecision {
  kind: ApprovalKind;
  id: string;
  action: ApprovalActionId;
  reason?: string;
  minutes?: number;
  expiresOn?: string;
  /** clientRequest: the workspace the job goes to. */
  spaceId?: string;
}

export type ApprovalRoute = { ok: true; method: 'POST' | 'PATCH'; path: string; body: Record<string, unknown> } | { ok: false; code: 'APPROVAL_INVALID'; field: string };

const enc = encodeURIComponent;
const MAX_REASON = 500;

/**
 * Which EXISTING route a decision calls, and with what body — the one mapping
 * web and phone share, so a button means the same thing on both. Checks only
 * what the route needs to be called at all; the route checks the rest.
 */
export function approvalRoute(d: ApprovalDecision): ApprovalRoute {
  const spec = APPROVAL_KIND_SPECS[d.kind];
  const action = spec?.actions.find((a) => a.id === d.action);
  if (!spec || !action) return { ok: false, code: 'APPROVAL_INVALID', field: 'action' };
  if (typeof d.id !== 'string' || !d.id || d.id.length > 128) return { ok: false, code: 'APPROVAL_INVALID', field: 'id' };
  const reason = typeof d.reason === 'string' ? d.reason.trim().slice(0, MAX_REASON) : '';
  if (action.reason === 'required' && !reason) return { ok: false, code: 'APPROVAL_INVALID', field: 'reason' };
  const minutes = Number.isInteger(d.minutes) ? (d.minutes as number) : undefined;
  if (action.input === 'minutes' && d.kind !== 'extraTime' && minutes === undefined) return { ok: false, code: 'APPROVAL_INVALID', field: 'minutes' };
  const id = enc(d.id);
  const yes = d.action === 'approve';
  switch (d.kind) {
    case 'hours':
      return yes
        ? { ok: true, method: 'POST', path: `/attendance/approvals/${id}/approve`, body: {} }
        : { ok: true, method: 'POST', path: `/attendance/approvals/${id}/reject`, body: { reason } };
    case 'away':
      return yes
        ? { ok: true, method: 'PATCH', path: `/attendance/excursions/${id}/approve`, body: minutes !== undefined ? { grantedMinutes: minutes } : {} }
        : { ok: true, method: 'PATCH', path: `/attendance/excursions/${id}/reject`, body: {} };
    case 'extraTime':
      if (yes && minutes === undefined) return { ok: false, code: 'APPROVAL_INVALID', field: 'minutes' };
      return yes
        ? { ok: true, method: 'POST', path: `/attendance/extra-time/${id}/approve`, body: { minutes } }
        : { ok: true, method: 'POST', path: `/attendance/extra-time/${id}/reject`, body: reason ? { reason } : {} };
    case 'overtime':
      return yes
        ? { ok: true, method: 'POST', path: `/overtime/${id}/approve`, body: { maxDurationMinutes: minutes } }
        : { ok: true, method: 'POST', path: `/overtime/${id}/reject`, body: { reason } };
    case 'request':
      return { ok: true, method: 'PATCH', path: `/employees/time-off/${id}/approve`, body: yes ? { approved: true } : { approved: false, ...(reason ? { rejectionReason: reason } : {}) } };
    case 'noShow':
      return { ok: true, method: 'PATCH', path: `/attendance/no-shows/${id}`, body: { action: 'excuse', ...(reason ? { reason } : {}) } };
    case 'issue':
      return { ok: true, method: 'POST', path: `/shift-issues/${id}/acknowledge`, body: {} };
    case 'expense':
      return { ok: true, method: 'POST', path: `/assets/expenses/${id}/review`, body: { decision: yes ? 'accept' : 'reject', ...(reason ? { note: reason } : {}) } };
    case 'assetProposal':
      return yes
        ? { ok: true, method: 'POST', path: `/assets/proposals/${id}/accept`, body: {} }
        : { ok: true, method: 'POST', path: `/assets/proposals/${id}/reject`, body: reason ? { note: reason } : {} };
    case 'document':
      return yes
        ? { ok: true, method: 'POST', path: `/documents/${id}/verify`, body: d.expiresOn ? { expiresOn: d.expiresOn } : {} }
        : { ok: true, method: 'POST', path: `/documents/${id}/reject`, body: { reason } };
    case 'join':
      return yes
        ? { ok: true, method: 'PATCH', path: `/join-requests/${id}/approve`, body: { role: 'EMPLOYEE' } }
        : { ok: true, method: 'PATCH', path: `/join-requests/${id}/reject`, body: reason ? { reason } : {} };
    case 'clientRequest':
      if (!d.spaceId) return { ok: false, code: 'APPROVAL_INVALID', field: 'spaceId' };
      return { ok: true, method: 'POST', path: `/portal/admin/requests/${id}/triage`, body: { spaceId: d.spaceId } };
    case 'guestRequest':
      return { ok: true, method: 'PATCH', path: `/share-requests/${id}/resolve`, body: { approve: yes } };
  }
}

/** Where the full page for an item lives on the web (the inbox links there when a decision needs more). */
export function approvalWebPath(item: ApprovalItem): string {
  const s = item.space?.id ? enc(item.space.id) : '';
  switch (item.kind) {
    case 'hours':
      return '/attendance?tab=approvals';
    case 'away':
    case 'noShow':
      return item.kind === 'noShow' ? '/attendance?tab=no-shows' : '/attendance?tab=tracking';
    case 'extraTime':
    case 'overtime':
      return '/overtime';
    case 'request':
      return '/employees/availability';
    case 'issue':
      return '/issues';
    case 'expense':
    case 'assetProposal':
      return '/assets';
    case 'document':
      return '/documents/review';
    case 'join':
      return '/join-requests';
    case 'clientRequest':
      return item.data.portalId && s ? `/locations/${s}/portals/${enc(String(item.data.portalId))}` : '/locations';
    case 'guestRequest':
      return s ? `/locations/${s}?tab=sharing` : '/locations';
  }
}
