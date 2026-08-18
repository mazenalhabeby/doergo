import { buildWorkspaceBoxes, type BuildWorkspaceBoxesInput } from '../build-workspace-boxes'

/**
 * The grouping rules the dashboard is actually judged on: a clocked-in member
 * appears ACTIVE in exactly one space and off-shift everywhere else, off-duty
 * means offline rather than merely not-clocked-in, and nobody on the clock is
 * ever invisible even with no space and no task.
 */

const member = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, firstName: id.toUpperCase(), lastName: 'X', role: 'EMPLOYEE', isActive: true, ...over }) as never

function input(over: Partial<BuildWorkspaceBoxesInput> = {}): BuildWorkspaceBoxesInput {
  const members = over.members ?? []
  return {
    locations: [],
    tasks: [],
    members,
    assignmentsPerLocation: new Map(),
    clockedInUserIds: new Set(),
    onBreakUserIds: new Set(),
    attendanceByUser: new Map(),
    activeTaskMap: new Map(),
    rosterActiveTaskMap: new Map(),
    activeSpaceByUser: new Map(),
    spaceNameById: new Map(),
    shiftLabelInfo: () => ({ isShiftBased: false, atSpace: false }),
    isAdminOrDispatcher: true,
    currentUserId: 'viewer',
    handlers: { onViewTasks: () => {}, onPersonClick: () => {} },
    // Default the lookup from `members` unless a caller supplies its own.
    memberMap: over.memberMap ?? new Map(members.map((m) => [m.id, m])),
    ...over,
  }
}

const space = (id: string, name = id) => ({ id, name, isActive: true })
const titles = (boxes: { title: string }[]) => boxes.map((b) => b.title)

describe('buildWorkspaceBoxes', () => {
  it('renders a card per active space and skips archived ones', () => {
    const boxes = buildWorkspaceBoxes(
      input({ locations: [space('s1', 'Main'), { id: 's2', name: 'Old', isActive: false }] }),
    )
    expect(titles(boxes)).toEqual(['Main'])
  })

  it('places a member clocked in at a space under Present', () => {
    const m = member('u1')
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        members: [m],
        assignmentsPerLocation: new Map([['s1', new Set(['u1'])]]),
        clockedInUserIds: new Set(['u1']),
        attendanceByUser: new Map([['u1', { locationId: 's1', isRemote: false, withinGeofence: true }]]),
        activeSpaceByUser: new Map([['u1', 's1']]),
      }),
    )
    expect(boxes[0].people).toHaveLength(1)
    expect(boxes[0].activeCount).toBe(1)
  })

  it('counts a member as ACTIVE in one space only, off-shift in the others', () => {
    const m = member('u1')
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1'), space('s2')],
        members: [m],
        assignmentsPerLocation: new Map([
          ['s1', new Set(['u1'])],
          ['s2', new Set(['u1'])],
        ]),
        clockedInUserIds: new Set(['u1']),
        attendanceByUser: new Map([['u1', { locationId: 's1', isRemote: false, withinGeofence: true }]]),
        activeSpaceByUser: new Map([['u1', 's1']]),
        spaceNameById: new Map([['s1', 's1']]),
      }),
    )
    const [first, second] = boxes
    expect(first.people).toHaveLength(1)
    expect(second.people).toHaveLength(0)
    // Visible on the other card, but as off-shift with a hint of where they are.
    expect(second.offShiftPeople).toHaveLength(1)
    expect(second.activeCount).toBe(0)
  })

  it('separates a clocked-in member outside the geofence into In Field', () => {
    const m = member('u1')
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        members: [m],
        assignmentsPerLocation: new Map([['s1', new Set(['u1'])]]),
        clockedInUserIds: new Set(['u1']),
        attendanceByUser: new Map([['u1', { locationId: 's1', isRemote: false, withinGeofence: false }]]),
        activeSpaceByUser: new Map([['u1', 's1']]),
        shiftLabelInfo: () => ({ isShiftBased: true, atSpace: false }),
      }),
    )
    expect(boxes[0].onRoadPeople).toHaveLength(1)
    expect(boxes[0].people).toHaveLength(0)
  })

  it('separates a remote clock-in into the off-site group', () => {
    const m = member('u1')
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        members: [m],
        assignmentsPerLocation: new Map([['s1', new Set(['u1'])]]),
        clockedInUserIds: new Set(['u1']),
        attendanceByUser: new Map([['u1', { locationId: 's1', isRemote: true, withinGeofence: false }]]),
        activeSpaceByUser: new Map([['u1', 's1']]),
      }),
    )
    expect(boxes[0].remotePeople).toHaveLength(1)
  })

  it('splits members who are off the clock by whether they are still reachable', () => {
    const online = member('on', { lastActiveAt: new Date().toISOString() })
    const offline = member('off', { lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        members: [online, offline],
        assignmentsPerLocation: new Map([['s1', new Set(['on', 'off'])]]),
      }),
    )
    expect(boxes[0].offShiftPeople).toHaveLength(1)
    expect(boxes[0].offDutyPeople).toHaveLength(1)
  })

  it('never hides a clocked-in member who has no space and no task', () => {
    const boxes = buildWorkspaceBoxes(
      input({ members: [member('u1')], clockedInUserIds: new Set(['u1']) }),
    )
    // A catch-all card exists and holds them.
    expect(boxes).toHaveLength(1)
    expect(boxes[0].type).toBe('dynamic')
    expect(boxes[0].people).toHaveLength(1)
  })

  it('omits admins who are not on the clock, so they are not idle clutter', () => {
    const boxes = buildWorkspaceBoxes(
      input({ members: [member('a1', { role: 'ADMIN', lastActiveAt: new Date().toISOString() })] }),
    )
    expect(boxes).toEqual([])
  })

  it('skips deactivated members entirely', () => {
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        members: [member('u1', { isActive: false })],
        assignmentsPerLocation: new Map([['s1', new Set(['u1'])]]),
      }),
    )
    expect(boxes[0].people).toHaveLength(0)
    expect(boxes[0].offDutyPeople).toHaveLength(0)
  })

  it('counts blocked and overdue tasks as that space’s alerts', () => {
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        tasks: [
          { id: 't1', spaceId: 's1', status: 'BLOCKED' },
          { id: 't2', spaceId: 's1', status: 'IN_PROGRESS', dueDate: '2020-01-01T00:00:00Z' },
          { id: 't3', spaceId: 's1', status: 'COMPLETED', dueDate: '2020-01-01T00:00:00Z' },
        ] as never,
      }),
    )
    // Blocked + overdue-open count; an overdue COMPLETED task does not.
    expect(boxes[0].alerts).toBe(2)
  })

  it('withholds manage/assign from non-admins', () => {
    const asAdmin = buildWorkspaceBoxes(
      input({ locations: [space('s1')], handlers: { onEdit: () => {}, onAssign: () => {}, onViewTasks: () => {}, onPersonClick: () => {} } }),
    )
    const asMember = buildWorkspaceBoxes(input({ locations: [space('s1')], isAdminOrDispatcher: false }))
    expect(asAdmin[0].onEdit).toBeDefined()
    expect(asMember[0].onEdit).toBeUndefined()
    expect(asMember[0].onViewTasks).toBeDefined()
  })

  it('treats the viewer as online even when their own timestamp is stale', () => {
    const stale = member('viewer', { lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        members: [stale],
        assignmentsPerLocation: new Map([['s1', new Set(['viewer'])]]),
        currentUserId: 'viewer',
      }),
    )
    expect(boxes[0].offShiftPeople).toHaveLength(1)
    expect(boxes[0].offDutyPeople).toHaveLength(0)
  })

  it('returns nothing at all for an empty org', () => {
    expect(buildWorkspaceBoxes(input())).toEqual([])
  })
})
