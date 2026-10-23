/** Moved here unchanged from approval-kinds.ts. */
import { isNoShowExcuseReason } from '../../attendance/no-show';
import { APPROVAL_KIND_SPECS, type ApprovalActionId, type ApprovalItem, type ApprovalKind } from './kind-specs';

/* ------------------------------------------------------------------ deciding */

export interface ApprovalDecision {
  kind: ApprovalKind;
  id: string;
  action: ApprovalActionId;
  reason?: string;
  minutes?: number;
  expiresOn?: string;
  /** noShow excuse: what happened (`NO_SHOW_EXCUSE_REASONS`). */
  reasonCode?: string;
  /** noShow: the whole run of misses this one ends (the server finds the run itself). */
  wholeRun?: boolean;
  /** clientRequest: the workspace the job goes to. */
  spaceId?: string;
}

export type ApprovalRoute =
  | { ok: true; method: 'POST' | 'PATCH'; path: string; body: Record<string, unknown> }
  | { ok: false; code: 'APPROVAL_INVALID'; field: string };

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
  if (typeof d.id !== 'string' || !d.id || d.id.length > 128)
    return { ok: false, code: 'APPROVAL_INVALID', field: 'id' };
  const reason = typeof d.reason === 'string' ? d.reason.trim().slice(0, MAX_REASON) : '';
  if (action.reason === 'required' && !reason) return { ok: false, code: 'APPROVAL_INVALID', field: 'reason' };
  const minutes = Number.isInteger(d.minutes) ? (d.minutes as number) : undefined;
  if (action.input === 'minutes' && d.kind !== 'extraTime' && minutes === undefined)
    return { ok: false, code: 'APPROVAL_INVALID', field: 'minutes' };
  const id = enc(d.id);
  const yes = d.action === 'approve';
  switch (d.kind) {
    case 'hours':
      return yes
        ? { ok: true, method: 'POST', path: `/attendance/approvals/${id}/approve`, body: {} }
        : { ok: true, method: 'POST', path: `/attendance/approvals/${id}/reject`, body: { reason } };
    case 'away':
      return yes
        ? {
            ok: true,
            method: 'PATCH',
            path: `/attendance/excursions/${id}/approve`,
            body: minutes !== undefined ? { grantedMinutes: minutes } : {},
          }
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
    case 'outside':
      return {
        ok: true,
        method: 'POST',
        path: `/attendance/entries/${id}/outside`,
        body: { minutes: yes ? minutes : 0, ...(reason ? { reason } : {}) },
      };
    case 'request':
      return {
        ok: true,
        method: 'PATCH',
        path: `/employees/time-off/${id}/approve`,
        body: yes ? { approved: true } : { approved: false, ...(reason ? { rejectionReason: reason } : {}) },
      };
    case 'noShow': {
      const code = yes ? (isNoShowExcuseReason(d.reasonCode) ? d.reasonCode : 'OTHER') : undefined;
      return {
        ok: true,
        method: 'PATCH',
        path: `/attendance/no-shows/${id}`,
        body: {
          action: yes ? 'excuse' : 'absent',
          ...(code ? { reasonCode: code } : {}),
          ...(reason ? { reason } : {}),
          ...(d.wholeRun ? { wholeRun: true } : {}),
        },
      };
    }
    case 'issue':
      return { ok: true, method: 'POST', path: `/shift-issues/${id}/acknowledge`, body: {} };
    case 'expense':
      return {
        ok: true,
        method: 'POST',
        path: `/assets/expenses/${id}/review`,
        body: { decision: yes ? 'accept' : 'reject', ...(reason ? { note: reason } : {}) },
      };
    case 'assetProposal':
      return yes
        ? { ok: true, method: 'POST', path: `/assets/proposals/${id}/accept`, body: {} }
        : { ok: true, method: 'POST', path: `/assets/proposals/${id}/reject`, body: reason ? { note: reason } : {} };
    case 'document':
      return yes
        ? {
            ok: true,
            method: 'POST',
            path: `/documents/${id}/verify`,
            body: d.expiresOn ? { expiresOn: d.expiresOn } : {},
          }
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
    case 'outside':
      return '/attendance?tab=approvals';
    case 'request':
      return '/schedule';
    case 'issue':
      return '/issues';
    case 'expense':
    case 'assetProposal':
      return '/assets';
    case 'document':
      return '/documents/review';
    case 'join':
      return '/approvals?kind=join';
    case 'clientRequest':
      return item.data.portalId && s ? `/locations/${s}/portals/${enc(String(item.data.portalId))}` : '/locations';
    case 'guestRequest':
      return s ? `/locations/${s}?tab=sharing` : '/locations';
  }
}
