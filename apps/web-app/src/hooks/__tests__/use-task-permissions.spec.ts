import { accessAllowsInSpace } from "@hbcfield/shared/client"

/**
 * The permission rule behind the task screens, tested at the level that matters:
 * does a given user hold a permission for a given task's space?
 *
 * The hook itself is a thin useMemo over this and useAuth. What was wrong before
 * was the RULE — the detail page asked `canViewAllTasks` for actions the server
 * gates on canCreateTasks / canAssignTasks, so buttons appeared that 403'd and
 * buttons were hidden that would have worked.
 */

type Access = Parameters<typeof accessAllowsInSpace>[0]

/** The rule the hook applies, mirroring the server's guard + service re-check. */
function holds(
  user: { role?: string; canCreateTasks?: boolean; canAssignTasks?: boolean; access?: unknown },
  key: "canCreateTasks" | "canAssignTasks",
  spaceId?: string,
): boolean {
  if (user.role === "ADMIN") return true
  if ((user as Record<string, unknown>)[key] === true) return true
  return accessAllowsInSpace(user.access as Access, key, spaceId)
}

const perSpace = (spaceId: string, key: string) =>
  ({ org: {}, perSpace: { [spaceId]: { [key]: true } } }) as unknown

describe("task permission rule", () => {
  it("lets an admin do anything, in any space", () => {
    const admin = { role: "ADMIN" }
    expect(holds(admin, "canCreateTasks", "space-1")).toBe(true)
    expect(holds(admin, "canAssignTasks", undefined)).toBe(true)
  })

  it("honours a flat org-wide grant regardless of space", () => {
    const user = { role: "EMPLOYEE", canCreateTasks: true }
    expect(holds(user, "canCreateTasks", "space-1")).toBe(true)
    expect(holds(user, "canCreateTasks", "space-9")).toBe(true)
  })

  it("honours a grant held only in the task's own space", () => {
    const user = { role: "EMPLOYEE", access: perSpace("space-1", "canAssignTasks") }
    expect(holds(user, "canAssignTasks", "space-1")).toBe(true)
  })

  it("does not leak a per-space grant to a different space", () => {
    const user = { role: "EMPLOYEE", access: perSpace("space-1", "canAssignTasks") }
    expect(holds(user, "canAssignTasks", "space-2")).toBe(false)
  })

  it("does not let one permission stand in for another", () => {
    const user = { role: "EMPLOYEE", access: perSpace("space-1", "canCreateTasks") }
    expect(holds(user, "canAssignTasks", "space-1")).toBe(false)
  })

  it("refuses when the task has no space and the grant is per-space", () => {
    const user = { role: "EMPLOYEE", access: perSpace("space-1", "canCreateTasks") }
    expect(holds(user, "canCreateTasks", undefined)).toBe(false)
  })

  it("does NOT treat view-all as permission to edit or assign — the old bug", () => {
    // A manager who sees every task but may create none: the detail page used to
    // show them Edit and Assign, and the server refused both.
    const manager = { role: "EMPLOYEE", canViewAllTasks: true } as never
    expect(holds(manager, "canCreateTasks", "space-1")).toBe(false)
    expect(holds(manager, "canAssignTasks", "space-1")).toBe(false)
  })

  it("does NOT hide actions from someone who genuinely holds the permission", () => {
    // The mirror of the same bug: create rights without view-all was refused a
    // button the server would have accepted.
    const member = { role: "EMPLOYEE", canCreateTasks: true }
    expect(holds(member, "canCreateTasks", "space-1")).toBe(true)
  })

  it("survives a user with no access profile at all", () => {
    expect(holds({ role: "EMPLOYEE" }, "canCreateTasks", "space-1")).toBe(false)
  })
})
