import type { OrgMember } from "@/lib/api"
import type { TimeEntry } from "@hbcfield/shared"

/**
 * Who the dashboard computes presence over.
 *
 * The catch-all cards — On the Clock, Off-shift, Off Duty — cover people no
 * space and no task accounts for, so they need a list of the org's members.
 * That list comes from the directory, which requires `canManageUsers`.
 *
 * A MANAGER (canViewAllTasks without canManageUsers) therefore had no list at
 * all: the query is correctly not made, `members` was empty, and those cards
 * silently never rendered for them — a clocked-in member with no space and no
 * task was invisible to exactly the person whose job is to notice.
 *
 * The attendance feed they CAN read already names everyone currently on the
 * clock, so it stands in. Deliberately narrower than the directory: it carries
 * no avatar, no availability and no role, and it only knows people with an
 * entry today. That is enough for "nobody on the clock is invisible", which is
 * the guarantee the catch-all exists to make, and it needs no new endpoint and
 * no widened permission.
 */
export function buildPresenceDirectory(opts: {
  /** The org directory, empty when the viewer may not read it. */
  members: OrgMember[]
  /** Today's attendance entries; each may embed the user it belongs to. */
  todayEntries: TimeEntry[]
  /** Only admins and managers get the catch-all cards at all. */
  isAdminOrDispatcher: boolean
}): OrgMember[] {
  const { members, todayEntries, isAdminOrDispatcher } = opts

  // The real directory always wins — it is richer in every field.
  if (members.length > 0) return members
  if (!isAdminOrDispatcher) return members

  const derived = new Map<string, OrgMember>()
  for (const entry of todayEntries) {
    const user = entry.user
    if (!user?.id || derived.has(user.id)) continue
    derived.set(user.id, {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      // Attendance says nothing about either, and both have to be assumed for
      // the member to be considered at all. Someone with an entry today is by
      // definition an active worker.
      isActive: true,
      role: "EMPLOYEE",
    } as OrgMember)
  }
  return [...derived.values()]
}
