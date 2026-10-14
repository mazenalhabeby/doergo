import type { ResolvedAccess } from '../types/permissions';
import type { ApprovalKind } from './approval-kinds';
import { decideVia } from './approval-routing';

/**
 * Who decides a request somebody makes about THEIR OWN time — one rule, for
 * extra time on a shift and for every request (leave, a remote day, other
 * hours, overtime agreed ahead).
 *
 *   USUAL      a member: the workspace's leaders, else their watchers (as before)
 *   ADMINS     somebody who could decide this kind themselves — a leader. Nobody
 *              approves their own, and a leader is often the ONLY leader of their
 *              workspace, so their request went to nobody. It goes to the
 *              organization's administrators.
 *   AUTOMATIC  the only administrator. Nobody is above the owner: the request is
 *              approved at once and recorded as approved automatically.
 *
 * Nothing to set up. Who MAY decide is unchanged — each kind's own guard still
 * decides that; this is who is ASKED (and, for the owner, that nobody needs to be).
 */
export type OwnRequestRoute = 'USUAL' | 'ADMINS' | 'AUTOMATIC';

export function ownRequestRoute(
  subject: { isAdmin: boolean; access: ResolvedAccess | null | undefined },
  kind: ApprovalKind,
  /** The workspaces the request is about; empty = anywhere they hold the key. */
  spaceIds: readonly string[],
  /** Other active, internal administrators (never the subject). */
  otherAdmins: number,
): OwnRequestRoute {
  if (subject.isAdmin) return otherAdmins > 0 ? 'ADMINS' : 'AUTOMATIC';
  const leads = spaceIds.length
    ? spaceIds.some((s) => decideVia({ isAdmin: false, access: subject.access }, kind, s) !== null)
    : decideVia({ isAdmin: false, access: subject.access }, kind, null) !== null;
  return leads && otherAdmins > 0 ? 'ADMINS' : 'USUAL';
}
