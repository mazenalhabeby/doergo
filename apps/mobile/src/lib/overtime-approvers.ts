import type { Colleague } from './api/admin';

/**
 * Who may be asked to sign a member's overtime on this phone.
 *
 * ⚠️ NOT "members whose role string is ADMIN or DISPATCHER". That list came
 * from `GET /organizations/members`, which needs `canManageUsers` — so for the
 * person this screen exists for (a field worker, handing the phone to the
 * shift leader beside them) it answered 403 and the list was always empty. And
 * DISPATCHER is a retired role: a Manager, a Space Manager or a site
 * supervisor holding `canApproveOvertime` through a space role never matched.
 *
 * The candidates are the people the member can actually reach: the
 * organization's management contacts (any member may read them) and the
 * colleagues in their own workspaces. Whether the chosen person may approve is
 * the SERVER's decision (`leaderApproveSignature` checks `canApproveOvertime`
 * org-wide or in this shift's workspace) — the phone cannot see other people's
 * permissions, so it never pretends to filter by them.
 */
export interface ApproverCandidate {
  id: string;
  firstName: string;
  lastName: string;
  /** What to show under the name. */
  subtitle: string | null;
}

export function approverCandidates(
  lists: { managers: readonly Colleague[]; team: readonly Colleague[] },
  selfId: string | null | undefined,
): ApproverCandidate[] {
  const seen = new Set<string>();
  const out: ApproverCandidate[] = [];
  // Management first: the people most likely to hold the permission.
  for (const c of [...lists.managers, ...lists.team]) {
    if (!c?.id || c.id === selfId || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, firstName: c.firstName ?? '', lastName: c.lastName ?? '', subtitle: c.position || c.spaceName || null });
  }
  return out;
}
