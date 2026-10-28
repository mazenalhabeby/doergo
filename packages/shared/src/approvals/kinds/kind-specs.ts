/** Moved here unchanged from approval-kinds.ts. */
import type { AccessPermissionKey } from '../../types/permissions';
import type { ApprovalStepInfo } from '../approval-turn';

export const APPROVAL_KINDS = [
  'hours',
  'away',
  'extraTime',
  'overtime',
  'outside',
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
  /** Why the caller may decide it ("you approve hours at Binderholz"). Absent on a read-only item. */
  why?: { via: 'ADMIN' | 'ORG' | 'SPACE' | 'ASSIGNED' | 'DELEGATED'; fromName?: string | null };
  /** Half-way through office rules: who approved, what is still needed, and the caller's turn (approval-turn.ts). */
  step?: ApprovalStepInfo;

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
  /** Of which half-way under an office rule and waiting for the CALLER (`step.waitsForYou`). */
  waitsForYou: number;
  /** What the caller can act on NOW: not half-way, or half-way and waiting for them — the phone's home card. */
  actionable: number;
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
  input?: 'minutes' | 'expiresOn' | 'excuseReason';
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

const approve = (labelKey: string, extra: Partial<ApprovalActionSpec> = {}): ApprovalActionSpec => ({
  id: 'approve',
  labelKey,
  tone: 'primary',
  reason: 'none',
  ...extra,
});

const reject = (labelKey: string, reason: ApprovalActionSpec['reason']): ApprovalActionSpec => ({
  id: 'reject',
  labelKey,
  tone: 'danger',
  reason,
});

export const APPROVAL_KIND_SPECS: Record<ApprovalKind, ApprovalKindSpec> = {
  hours: {
    decideKey: 'canApproveAttendance',
    orgWide: false,
    actions: [approve('approve'), reject('reject', 'required')],
  },
  away: {
    decideKey: 'canApproveAttendance',
    orgWide: false,
    actions: [approve('allow'), reject('notAllowed', 'none')],
  },
  extraTime: {
    decideKey: 'canApproveOvertime',
    orgWide: false,
    actions: [approve('give', { input: 'minutes' }), reject('reject', 'optional')],
  },
  overtime: {
    decideKey: 'canApproveOvertime',
    orgWide: false,
    actions: [approve('approve', { input: 'minutes' }), reject('reject', 'required')],
  },
  // Time worked before the planned start / after the planned end (attendance/outside-shift.ts): count all or part of it
  // (the minutes, filled with all of it), or don't count it. Counting moves the plan, like approved overtime.
  // Decided by who approves HOURS (review A10): it changes counted time after the shift — the payroll
  // sign-off. The overtime it writes is still checked against canApproveOvertime in task-service.
  outside: {
    decideKey: 'canApproveAttendance',
    orgWide: false,
    actions: [approve('count', { input: 'minutes' }), { ...reject('notCount', 'optional'), tone: 'neutral' }],
  },
  request: { decideKey: 'canManageRota', orgWide: false, actions: [approve('approve'), reject('reject', 'optional')] },
  // Two answers that CLOSE it (attendance/no-show.ts): excused, with what happened — or a real missed day.
  noShow: {
    decideKey: 'canReconcileAttendance',
    orgWide: false,
    actions: [
      approve('excuse', { input: 'excuseReason', reason: 'optional' }),
      { ...reject('absent', 'none'), tone: 'neutral' },
    ],
  },
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
  guestRequest: {
    decideKey: 'canManageWorkspaces',
    orgWide: true,
    actions: [approve('approve'), reject('reject', 'none')],
  },
};

/* ------------------------------------------------------------------ order */

const GROUP_RANK: Record<ApprovalGroup, number> = { NOW: 0, TODAY: 1, LATER: 2 };

/** Now first; inside a group, the one that runs out first, then the one waiting longest. */
export function sortApprovals(items: ApprovalItem[]): ApprovalItem[] {
  const t = (s: string | null) => (s ? new Date(s).getTime() : Number.POSITIVE_INFINITY);
  return [...items].sort(
    (a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || t(a.dueAt) - t(b.dueAt) || t(a.raisedAt) - t(b.raisedAt),
  );
}

export function countApprovals(items: readonly ApprovalItem[]): ApprovalsCount {
  const byKind: Partial<Record<ApprovalKind, number>> = {};
  let now = 0;
  let waitsForYou = 0;
  let actionable = 0;
  for (const i of items) {
    byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
    if (i.group === 'NOW') now++;
    if (i.step?.waitsForYou) waitsForYou++;
    if (!i.step || i.step.waitsForYou) actionable++;
  }
  return { total: items.length, now, byKind, waitsForYou, actionable };
}
