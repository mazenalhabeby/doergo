import { buildWorkspaceBoxes, type BuildWorkspaceBoxesInput } from "../build-workspace-boxes"

/**
 * Pins the WHOLE output of buildWorkspaceBoxes for realistic dashboards.
 *
 * Recorded against the single-function version before it was rewritten into
 * steps; the rewrite must reproduce every card, every group and every node
 * byte for byte. The rule tests in build-workspace-boxes.spec say WHY; these
 * say "exactly the same as before".
 */

const NOW = new Date("2026-10-17T10:00:00Z")
const recent = new Date(NOW.getTime() - 60_000).toISOString()
const stale = new Date(NOW.getTime() - 3 * 86_400_000).toISOString()

beforeAll(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW)
})
afterAll(() => jest.useRealTimers())

const m = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, firstName: id.toUpperCase(), lastName: "X", role: "EMPLOYEE", isActive: true, ...over }) as never

const task = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, title: `Task ${id}`, status: "IN_PROGRESS", spaceId: null, dueDate: null, ...over }) as never

const att = (locationId: string, over: Record<string, unknown> = {}) => ({
  locationId,
  isRemote: false,
  withinGeofence: true,
  needsReview: false,
  ...over,
})

const handlers = {
  onEdit: function onEdit() {},
  onAssign: function onAssign() {},
  onViewTasks: function onViewTasks() {},
  onPersonClick: function onPersonClick() {},
}

function busyOrg(over: Partial<BuildWorkspaceBoxesInput> = {}): BuildWorkspaceBoxesInput {
  const members = [
    m("present", { lastActiveAt: recent, position: "Electrician" }),
    m("field", { lastActiveAt: recent }),
    m("remote", { lastActiveAt: recent }),
    m("break", { lastActiveAt: recent, specialty: "HVAC" }),
    m("review", { lastActiveAt: stale }),
    m("elsewhere", { lastActiveAt: recent }),
    m("wfh-elsewhere", { lastActiveAt: recent }),
    m("offshift", { lastActiveAt: recent }),
    m("offduty", { lastActiveAt: stale }),
    m("gone", { isActive: false }),
    // Two people who display as "Sam X." with no title → the role fallback.
    m("sam1", { firstName: "Sam", lastActiveAt: recent }),
    m("sam2", { firstName: "Sam", role: "ADMIN", lastActiveAt: stale }),
    m("ontask", { lastActiveAt: recent }),
    m("ontask-off", { lastActiveAt: stale }),
    m("floating", { lastActiveAt: recent }),
    m("floating-off", { lastActiveAt: stale }),
    m("floating-online", { lastActiveAt: recent }),
    m("owner", { role: "ADMIN", lastActiveAt: recent }),
    m("idle-admin", { role: "ADMIN", lastActiveAt: recent }),
  ]
  return {
    locations: [
      { id: "s1", name: "Main Office", isActive: true },
      { id: "s2", name: "Warehouse", isActive: true },
      { id: "s3", name: "Closed", isActive: false },
      { id: "s4", name: "Empty", isActive: true },
    ],
    tasks: [
      task("t1", { status: "BLOCKED", spaceId: "s1" }),
      task("t2", { spaceId: "s1", dueDate: "2026-10-01T00:00:00Z" }),
      task("t3", { spaceId: "s2" }),
      task("t4", { status: "BLOCKED", locationAddress: "Hall 2, Warehouse, Gmunden" }),
      task("t5", { status: "COMPLETED", spaceId: "s1", dueDate: "2026-10-01T00:00:00Z" }),
    ],
    members,
    memberMap: new Map(members.map((x: { id: string }) => [x.id, x])) as never,
    assignmentsPerLocation: new Map([
      [
        "s1",
        new Set(["present", "field", "remote", "break", "review", "elsewhere", "offshift", "gone", "sam1", "ghost"]),
      ],
      ["s2", new Set(["present", "wfh-elsewhere", "offduty", "sam2", "elsewhere"])],
      ["s3", new Set(["present"])],
    ]),
    clockedInUserIds: new Set([
      "present",
      "field",
      "remote",
      "break",
      "review",
      "elsewhere",
      "wfh-elsewhere",
      "sam1",
      "ontask",
      "floating",
      "owner",
      "orphan",
    ]),
    onBreakUserIds: new Set(["break"]),
    attendanceByUser: new Map([
      ["present", att("s1")],
      ["field", att("s1", { workPresence: "FIELD", freshness: "LIVE", lastSeenAt: recent })],
      ["remote", att("s1", { isRemote: true })],
      ["break", att("s1")],
      ["review", att("s1", { needsReview: true, workPresence: "SITE", freshness: "QUIET", lastSeenAt: stale })],
      ["elsewhere", att("s2")],
      ["wfh-elsewhere", att("s1", { isRemote: true })],
      ["sam1", att("s1")],
      ["ontask", att("s9")],
      ["floating", att("s9", { needsReview: true })],
      ["owner", att("s9")],
      ["orphan", att("s9", { isRemote: true })],
    ]),
    activeTaskMap: new Map([
      ["present", task("a1", { title: "Fix boiler" })],
      ["ontask", task("a2", { title: "Roof job" })],
      ["ontask-off", task("a3", { title: "Paperwork" })],
      [
        "orphan",
        task("a4", {
          title: "Visit",
          assignedTo: { id: "orphan", firstName: "Olga", lastName: "Pane", avatarUrl: null },
        }),
      ],
      ["unknown", task("a5", { title: "No assignee" })],
    ]),
    rosterActiveTaskMap: new Map([["field", { title: "Cable run", status: "EN_ROUTE" }]]),
    activeSpaceByUser: new Map([
      ["present", "s1"],
      ["field", "s1"],
      ["remote", "s1"],
      ["break", "s1"],
      ["review", "s1"],
      ["elsewhere", "s2"],
      ["wfh-elsewhere", "s1"],
      ["sam1", "s1"],
    ]),
    spaceNameById: new Map([
      ["s1", "Main Office"],
      ["s2", "Warehouse"],
    ]),
    shiftLabelInfo: (userId: string) => ({
      isShiftBased: userId !== "remote",
      atSpace: !["field", "floating"].includes(userId),
    }),
    isAdminOrDispatcher: true,
    currentUser: { canManageWorkspaces: false, canManageUsers: false, canViewAllTasks: true, access: null },
    currentUserId: "offduty",
    handlers,
    ...over,
  }
}

describe("buildWorkspaceBoxes — pinned output", () => {
  it("an empty organization", () => {
    expect(
      buildWorkspaceBoxes({
        locations: [],
        tasks: [],
        members: [],
        memberMap: new Map(),
        assignmentsPerLocation: new Map(),
        clockedInUserIds: new Set(),
        onBreakUserIds: new Set(),
        attendanceByUser: new Map(),
        activeTaskMap: new Map(),
        rosterActiveTaskMap: new Map(),
        activeSpaceByUser: new Map(),
        spaceNameById: new Map(),
        shiftLabelInfo: () => ({ isShiftBased: false, atSpace: false }),
        isAdminOrDispatcher: false,
        currentUser: null,
        handlers: { onViewTasks: handlers.onViewTasks, onPersonClick: handlers.onPersonClick },
      }),
    ).toMatchSnapshot()
  })

  it("a busy organization seen org-wide", () => {
    expect(buildWorkspaceBoxes(busyOrg())).toMatchSnapshot()
  })

  it("the same organization seen by a viewer of their own spaces only", () => {
    expect(
      buildWorkspaceBoxes(
        busyOrg({
          currentUser: {
            canViewAllTasks: false,
            access: { orgWide: {}, spaces: { s1: { canManageWorkspaces: true } } },
          },
          currentUserId: "present",
        }),
      ),
    ).toMatchSnapshot()
  })

  it("a manager who may manage every space", () => {
    expect(
      buildWorkspaceBoxes(busyOrg({ currentUser: { canManageWorkspaces: true, canManageUsers: true } })),
    ).toMatchSnapshot()
  })

  it("a viewer who may not read the directory", () => {
    const base = busyOrg()
    expect(buildWorkspaceBoxes({ ...base, members: [] })).toMatchSnapshot()
  })
})
