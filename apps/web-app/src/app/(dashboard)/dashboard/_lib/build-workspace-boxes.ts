import type { WorkspaceBoxProps } from "@/components/dashboard"

import { addLeftoverBoxes, addOnTaskBox } from "./workspace-box-catchall"
import { peopleRules, reserveSubtitleRows } from "./workspace-box-people"
import { addSpaceBox, type BoxAccumulator } from "./workspace-box-space"
import type { BuildWorkspaceBoxesInput } from "./workspace-boxes-types"

export { displayName, subtitleFor } from "./workspace-box-people"
export type { AttendanceFacts, BuildWorkspaceBoxesInput } from "./workspace-boxes-types"

/**
 * Build the dashboard's space cards.
 *
 * This is the dashboard's real logic: which member belongs to which card, in
 * which of the five groups (present / in field / off-site / off-shift / off
 * duty), plus the catch-all cards for people no space accounts for. It ran as a
 * 250-line closure inside the page component, where it could not be read in
 * isolation or tested at all.
 *
 * Pure: everything it needs arrives as arguments, so the same inputs always
 * produce the same cards. Handlers are passed through rather than captured.
 *
 * Three steps, in order, over one accumulator: a card per active space, then
 * "On Task" for people working a job no space accounts for, then the
 * catch-alls. A person placed by an earlier step is never placed again. The
 * whole output is pinned in `build-workspace-boxes.pin.spec.ts`.
 */
export function buildWorkspaceBoxes(input: BuildWorkspaceBoxesInput): WorkspaceBoxProps[] {
  const { locations, members, currentUser } = input
  /*
    Can this viewer see everybody, or only their own spaces?

    The FLAT columns, deliberately — they carry the org-wide resolution, which
    is precisely the question here. `isAdminOrDispatcher` cannot be used: it now
    answers "holds view-all-tasks anywhere, including in one space", which is
    true of the very people this must restrict.
  */
  const viewerIsOrgWide = currentUser?.canViewAllTasks === true || currentUser?.canManageUsers === true

  const rules = peopleRules(members, input.currentUserId)
  // Track which worker IDs are accounted for (placed in a location box)
  const acc: BoxAccumulator = { boxes: [], accountedWorkerIds: new Set<string>() }

  for (const loc of locations) {
    if (!loc.isActive) continue
    addSpaceBox(acc, input, rules, loc)
  }
  addOnTaskBox(acc, input, rules, viewerIsOrgWide)
  addLeftoverBoxes(acc, input, rules)

  return acc.boxes.map(reserveSubtitleRows)
}
