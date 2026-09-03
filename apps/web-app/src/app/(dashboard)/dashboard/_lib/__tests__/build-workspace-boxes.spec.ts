import { buildWorkspaceBoxes, displayName, subtitleFor, type BuildWorkspaceBoxesInput } from '../build-workspace-boxes'

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
        attendanceByUser: new Map([['u1', { locationId: 's1', isRemote: false, withinGeofence: true, needsReview: false }]]),
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
        attendanceByUser: new Map([['u1', { locationId: 's1', isRemote: false, withinGeofence: true, needsReview: false }]]),
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
        attendanceByUser: new Map([['u1', { locationId: 's1', isRemote: false, withinGeofence: false, needsReview: false }]]),
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
        attendanceByUser: new Map([['u1', { locationId: 's1', isRemote: true, withinGeofence: false, needsReview: false }]]),
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

  /*
    Manage and Add-member follow the permission each one NEEDS, per space.

    This used to assert they followed `isAdminOrDispatcher` — "can view all
    tasks". That became wrong the moment a member could hold that permission in
    a single space: they were offered both buttons, and both led to an endpoint
    that refused them. Managing a workspace needs canManageWorkspaces; adding a
    member needs canManageUsers.
  */
  const handlers = { onEdit: () => {}, onAssign: () => {}, onViewTasks: () => {}, onPersonClick: () => {} }

  it('offers manage/assign to somebody who holds the permissions org-wide', () => {
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        handlers,
        currentUser: { canManageWorkspaces: true, canManageUsers: true },
      } as never),
    )
    expect(boxes[0].onEdit).toBeDefined()
    expect(boxes[0].onAssign).toBeDefined()
  })

  it('withholds them from a member who holds neither — the endpoints would refuse', () => {
    const boxes = buildWorkspaceBoxes(
      input({ locations: [space('s1')], handlers, currentUser: {} } as never),
    )
    expect(boxes[0].onEdit).toBeUndefined()
    expect(boxes[0].onAssign).toBeUndefined()
    // Viewing is not gated on either — the read is theirs.
    expect(boxes[0].onViewTasks).toBeDefined()
  })

  it('a SPACE grant reaches that space and no other', () => {
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1'), space('s2')],
        handlers,
        currentUser: { access: { org: {}, perSpace: { s1: { canManageWorkspaces: true } } } },
      } as never),
    )
    const s1 = boxes.find((b) => b.locationId === 's1')!
    const s2 = boxes.find((b) => b.locationId === 's2')!
    expect(s1.onEdit).toBeDefined()
    expect(s2.onEdit).toBeUndefined()
  })

  it('view-all-tasks alone does NOT confer them — the bug this replaced', () => {
    const boxes = buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        handlers,
        currentUser: { access: { org: {}, perSpace: { s1: { canViewAllTasks: true } } } },
      } as never),
    )
    expect(boxes[0].onEdit).toBeUndefined()
    expect(boxes[0].onAssign).toBeUndefined()
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


describe('what goes under a name', () => {
  const m = (over: Record<string, unknown> = {}) =>
    ({ id: 'u', firstName: 'Andreas', lastName: 'Holub', role: 'EMPLOYEE', isActive: true, ...over }) as never

  it('shows a title to everyone who has one, shared name or not', () => {
    // A roster reads better when it says who does what. This is not a
    // disambiguation feature that happens to show titles — it shows titles.
    expect(subtitleFor(m({ position: 'Electrician' }), false)).toBe('Electrician')
    expect(subtitleFor(m({ position: 'Electrician' }), true)).toBe('Electrician')
  })

  it('prefers the position, then the specialty', () => {
    expect(subtitleFor(m({ position: 'Sales', specialty: 'HVAC' }), false)).toBe('Sales')
    expect(subtitleFor(m({ position: '  ', specialty: 'HVAC' }), false)).toBe('HVAC')
  })

  it('says nothing about someone with no title and a name of their own', () => {
    // "Member" under every name repeats what the card already implies and
    // pushes a line into every node to say nothing.
    expect(subtitleFor(m(), false)).toBeUndefined()
  })

  it('falls back to the role only when the name is shared and there is no title', () => {
    // The real case: two accounts, one full name, one of them with no position.
    // Without this they render identically, in different states, and read as
    // one person in two places.
    expect(subtitleFor(m({ role: 'ADMIN' }), true)).toBeTruthy()
    expect(subtitleFor(m({ role: 'ADMIN' }), true)).not.toBe(subtitleFor(m({ position: 'Sales' }), true))
  })

  it('renders the same label for two accounts of the same name', () => {
    // The premise: these collide, so something else has to separate them. Both
    // real accounts share a FULL name, so the surname would not have helped.
    expect(displayName(m())).toBe(displayName(m({ id: 'other' })))
  })

  it('never falls back to the email', () => {
    expect(subtitleFor(m({ email: 'a.holub@hbc-group.eu' }), true)).not.toContain('@')
  })

  it('survives a member with no surname', () => {
    expect(displayName({ firstName: 'Ada', lastName: '' } as never)).toBe('Ada')
  })
})

/*
  Whose people show on the board.

  `memberMap` holds the rosters of the spaces the viewer can see. Somebody
  missing from it is working at a site the viewer supervises while being
  ROSTERED somewhere else — their task is visible, they are not. A fallback to
  `task.assignedTo` used to put them on the board anyway, assembled from a
  person the viewer was never given.
*/
describe('people on the board come from visible rosters', () => {
  const handlers2 = { onEdit: () => {}, onAssign: () => {}, onViewTasks: () => {}, onPersonClick: () => {} }

  const withOutsiderOnTask = (currentUser: unknown) =>
    buildWorkspaceBoxes(
      input({
        locations: [space('s1')],
        handlers: handlers2,
        currentUser,
        /*
          An active task in the viewer's space, assigned to somebody who is NOT
          on its roster — the builder reads this map, not the task list, so the
          fixture has to hand it over the same way the dashboard does.
        */
        activeTaskMap: new Map([
          [
            'outsider',
            {
              id: 't1',
              title: 'Ticket: badge access denied',
              status: 'IN_PROGRESS',
              spaceId: 's1',
              assignedTo: { id: 'outsider', firstName: 'Hassan', lastName: 'Berger', avatarUrl: null },
            },
          ],
        ]),
      } as never),
    )

  it('does not surface somebody rostered elsewhere to a space-scoped viewer', () => {
    const boxes = withOutsiderOnTask({ access: { org: {}, perSpace: { s1: { canViewAllTasks: true } } } })
    const names = boxes.flatMap((b) => [
      ...(b.people ?? []),
      ...((b as { onRoadPeople?: unknown[] }).onRoadPeople ?? []),
    ]) as { name?: string }[]
    expect(names.some((p) => (p.name ?? '').startsWith('Hassan'))).toBe(false)
  })

  it('still surfaces them to an org-wide viewer, whose roster is everyone', () => {
    const boxes = withOutsiderOnTask({ canViewAllTasks: true })
    const found = JSON.stringify(boxes).includes('Hassan')
    expect(found).toBe(true)
  })
})
