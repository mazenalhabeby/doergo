import {
  canAccessTask,
  isTaskAssignee,
  isWithinTaskBoundary,
  type TaskAccessCaller,
  type TaskAccessSubject,
} from "@hbcfield/shared/client"

/**
 * The single per-task authorization rule, shared by tasks.service and
 * attachments.service. It decides whether one customer's user may touch
 * another customer's data, so it is tested on its own — the service specs then
 * only have to prove they ask it correctly.
 */

const OWN = "org-own"
const OTHER = "org-other"

const task = (over: Partial<TaskAccessSubject> = {}): TaskAccessSubject => ({
  organizationId: OWN,
  spaceId: "space-1",
  assignedToId: null,
  assignees: [],
  ...over,
})
const caller = (over: Partial<TaskAccessCaller> = {}): TaskAccessCaller => ({
  userId: "u1",
  userRole: "EMPLOYEE",
  organizationId: OWN,
  ...over,
})

describe("isWithinTaskBoundary", () => {
  it("admits a task in the caller's own organization", () => {
    expect(isWithinTaskBoundary(task(), caller())).toBe(true)
  })

  it("refuses another organization's task by default", () => {
    expect(isWithinTaskBoundary(task({ organizationId: OTHER }), caller())).toBe(false)
  })

  it("admits a foreign task only through an explicit share of its space", () => {
    const foreign = task({ organizationId: OTHER, spaceId: "shared-1" })
    expect(isWithinTaskBoundary(foreign, caller({ sharedSpaceIds: ["shared-1"] }))).toBe(true)
    expect(isWithinTaskBoundary(foreign, caller({ sharedSpaceIds: ["other-space"] }))).toBe(false)
  })

  it("cannot be crossed by a share when the task belongs to no space", () => {
    const foreign = task({ organizationId: OTHER, spaceId: null })
    expect(isWithinTaskBoundary(foreign, caller({ sharedSpaceIds: ["shared-1"] }))).toBe(false)
  })
})

describe("isTaskAssignee", () => {
  it("recognises the lead", () => {
    expect(isTaskAssignee(task({ assignedToId: "u1" }), "u1")).toBe(true)
  })

  it("recognises a co-assignee", () => {
    expect(isTaskAssignee(task({ assignees: [{ userId: "u1" }] }), "u1")).toBe(true)
  })

  it("says no when the rows are loaded and the caller is absent", () => {
    expect(isTaskAssignee(task({ assignees: [{ userId: "someone" }] }), "u1")).toBe(false)
  })

  it("returns null — not false — when the rows were never loaded", () => {
    // The caller must look it up; guessing false would lock people out of
    // their own tasks whenever the query omitted the relation.
    expect(isTaskAssignee(task({ assignees: undefined }), "u1")).toBeNull()
  })
})

describe("canAccessTask", () => {
  it("lets an assignee in", () => {
    expect(canAccessTask(task({ assignedToId: "u1" }), caller())).toBe(true)
  })

  it("lets an admin of the same organization in", () => {
    expect(canAccessTask(task(), caller({ userRole: "ADMIN" }))).toBe(true)
  })

  it("lets a view-all grant in", () => {
    expect(canAccessTask(task(), caller({ canViewAllTasks: true }))).toBe(true)
  })

  it("keeps out a member with no relationship to the task", () => {
    expect(canAccessTask(task(), caller())).toBe(false)
  })

  describe("the boundary beats every relationship", () => {
    it("refuses an assignee whose task is in another organization", () => {
      expect(canAccessTask(task({ organizationId: OTHER, assignedToId: "u1" }), caller())).toBe(false)
    })

    it("refuses an admin outside their organization", () => {
      expect(canAccessTask(task({ organizationId: OTHER }), caller({ userRole: "ADMIN" }))).toBe(false)
    })

    it("refuses a view-all grant outside their organization", () => {
      expect(canAccessTask(task({ organizationId: OTHER }), caller({ canViewAllTasks: true }))).toBe(false)
    })
  })

  it("accepts a looked-up assignee answer when the rows were not loaded", () => {
    const t = task({ assignees: undefined })
    expect(canAccessTask(t, caller(), true)).toBe(true)
    expect(canAccessTask(t, caller(), false)).toBe(false)
  })

  it("still enforces the boundary even with a looked-up yes", () => {
    expect(canAccessTask(task({ organizationId: OTHER, assignees: undefined }), caller(), true)).toBe(false)
  })
})
