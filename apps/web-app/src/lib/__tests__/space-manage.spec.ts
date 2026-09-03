import { canManageSpace, canManageMembersInSpace } from "@hbcfield/shared/client"

/**
 * Who is offered the space controls — Configure, and Assign.
 *
 * One rule, now asked by both clients: the web dashboard and the mobile board
 * each draw an Assign button on every space card. It decides what to RENDER;
 * the endpoints refuse independently, so the only thing a wrong answer here can
 * do is show a control that leads to a refusal, or hide one that would have
 * worked. Both are bugs the user has reported, in that order.
 */

const spaceRole = (spaceId: string, perms: Record<string, boolean>) => ({
  access: { org: {}, perSpace: { [spaceId]: perms } },
})

describe("configuring a space", () => {
  it("is offered to an org-wide holder, everywhere", () => {
    expect(canManageSpace({ canManageWorkspaces: true }, "s1")).toBe(true)
    expect(canManageSpace({ canManageWorkspaces: true }, "s2")).toBe(true)
  })

  it("is offered to a Space Manager IN THEIR OWN SPACE", () => {
    const user = spaceRole("s1", { canManageWorkspaces: true })
    expect(canManageSpace(user, "s1")).toBe(true)
  })

  it("and nowhere else — the grant is the space, not the person", () => {
    const user = spaceRole("s1", { canManageWorkspaces: true })
    expect(canManageSpace(user, "s2")).toBe(false)
  })

  it("is not offered to somebody who merely oversees the work there", () => {
    // An external supervisor: real authority over a site, none over its setup.
    expect(canManageSpace(spaceRole("s1", { canViewAllTasks: true }), "s1")).toBe(false)
  })

  it("is refused with no user at all", () => {
    expect(canManageSpace(null, "s1")).toBe(false)
    expect(canManageSpace(undefined, "s1")).toBe(false)
  })
})

describe("adding people to a space", () => {
  /*
    `POST /locations/:id/members` is
    `@RequirePermissionInSpace('canManageWorkspaces')`, and PermissionsGuard does
    not accept `canManageUsers` in its place. Asking for the wrong permission
    showed the Assign button to a member the server then refused.
  */
  it("asks for the permission the endpoint enforces", () => {
    expect(canManageMembersInSpace({ canManageWorkspaces: true }, "s1")).toBe(true)
  })

  it("does not accept canManageUsers on its own — the server would refuse it", () => {
    expect(canManageMembersInSpace({ canManageUsers: true } as never, "s1")).toBe(false)
  })

  it("is not offered to a supervisor who only oversees the work", () => {
    const supervisor = spaceRole("s1", {
      canViewAllTasks: true,
      canViewSpaceAttendance: true,
      canApproveOvertime: true,
    })
    expect(canManageMembersInSpace(supervisor, "s1")).toBe(false)
  })
})
