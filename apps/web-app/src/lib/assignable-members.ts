/**
 * Where a "pick a person" list may come from — one rule for every picker.
 *
 * ⚠️ `GET /organizations/members` is `@RequirePermission('canManageUsers')`, and the
 * gateway's PermissionsGuard reads the FLAT org flag only (an admin passes). Asking
 * it as anybody else 403s, the list renders empty, and the picker looks broken —
 * which is how Assign came up empty for every manager and dispatcher. So:
 *
 *   • the organization directory, only for whoever may read it;
 *   • otherwise the workspace's own roster (`GET /locations/:id/members`), when the
 *     thing being assigned belongs to a workspace;
 *   • otherwise the rosters of every workspace the caller can see
 *     (`GET /locations` → `GET /locations/rosters`), de-duplicated.
 *
 * The server stays the authority on who may RECEIVE the work; this only decides
 * which list is asked for.
 */
import { isAdmin } from "@hbcfield/shared/client"
import type { LocationAssignment, OrgMember } from "@/lib/api"

export type MemberSource = "directory" | "space" | "visible-spaces"

/** The minimum a picker needs to draw a person, from any of the three sources. */
export interface AssignablePerson {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  avatarUrl?: string | null
  role?: string
  position?: string | null
  specialty?: string | null
  isActive?: boolean
  isExternal?: boolean
  workMode?: string
  /** Access profile — whether they can receive tasks at all. */
  enabledModules?: unknown
}

/** May this caller read `GET /organizations/members`? Mirrors the gateway guard. */
export function mayListOrgMembers(
  user: { role?: string; canManageUsers?: boolean } | null | undefined,
): boolean {
  if (!user) return false
  return isAdmin({ role: user.role ?? "" }) || user.canManageUsers === true
}

/**
 * Which list to ask for.
 *
 * `rosterOnly`: when a workspace is known, offer ITS people even to a directory
 * reader (work at a site goes to the people at that site — the New Task dialog).
 */
export function memberSourceFor(opts: {
  mayListOrg: boolean
  spaceId?: string | null
  rosterOnly?: boolean
}): MemberSource {
  if (opts.spaceId && opts.rosterOnly) return "space"
  if (opts.mayListOrg) return "directory"
  return opts.spaceId ? "space" : "visible-spaces"
}

export function personFromMember(m: OrgMember): AssignablePerson {
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    avatarUrl: m.avatarUrl ?? null,
    role: m.role,
    position: m.position ?? null,
    specialty: m.specialty ?? null,
    isActive: m.isActive,
    isExternal: m.isExternal,
    workMode: m.workMode,
    enabledModules: m.enabledModules,
  }
}

/** People on one or more rosters, each once, in roster order. */
export function peopleFromRosters(assignments: LocationAssignment[] | null | undefined): AssignablePerson[] {
  const seen = new Set<string>()
  const out: AssignablePerson[] = []
  for (const a of assignments ?? []) {
    const u = a.user
    if (!u || seen.has(u.id)) continue
    seen.add(u.id)
    out.push({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      avatarUrl: u.avatarUrl ?? null,
      isExternal: u.isExternal,
      workMode: u.workMode,
      enabledModules: u.enabledModules,
      isActive: true,
    })
  }
  return out
}
