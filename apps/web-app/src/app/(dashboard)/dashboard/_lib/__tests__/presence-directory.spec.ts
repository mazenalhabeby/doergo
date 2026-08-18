import { buildPresenceDirectory } from '../presence-directory'

/**
 * A manager (canViewAllTasks without canManageUsers) cannot read the member
 * directory, so the catch-all cards had nothing to iterate and silently never
 * rendered for them — a clocked-in member with no space and no task was
 * invisible to exactly the person meant to notice.
 */

const entry = (id: string, first = id.toUpperCase(), last = 'X') =>
  ({ id: `e-${id}`, userId: id, user: { id, firstName: first, lastName: last } }) as never

const member = (id: string) => ({ id, firstName: id, lastName: 'X', isActive: true, role: 'EMPLOYEE' }) as never

describe('buildPresenceDirectory', () => {
  it('uses the real directory whenever it is available', () => {
    const members = [member('a'), member('b')]
    const out = buildPresenceDirectory({ members, todayEntries: [entry('z')], isAdminOrDispatcher: true })
    expect(out).toBe(members) // same reference — richer data, and stable for memoisation
  })

  it('reconstructs a list from attendance when the directory is unreadable', () => {
    const out = buildPresenceDirectory({
      members: [],
      todayEntries: [entry('u1', 'Ada'), entry('u2', 'Grace')],
      isAdminOrDispatcher: true,
    })
    expect(out.map((m) => m.id)).toEqual(['u1', 'u2'])
    expect(out[0].firstName).toBe('Ada')
  })

  it('marks reconstructed people active, so they are not filtered out as deactivated', () => {
    const [only] = buildPresenceDirectory({
      members: [],
      todayEntries: [entry('u1')],
      isAdminOrDispatcher: true,
    })
    expect(only.isActive).toBe(true)
    expect(only.role).toBe('EMPLOYEE')
  })

  it('lists each person once however many entries they have today', () => {
    const out = buildPresenceDirectory({
      members: [],
      todayEntries: [entry('u1'), entry('u1'), entry('u2')],
      isAdminOrDispatcher: true,
    })
    expect(out.map((m) => m.id)).toEqual(['u1', 'u2'])
  })

  it('skips entries with no user attached', () => {
    const out = buildPresenceDirectory({
      members: [],
      todayEntries: [{ id: 'e1', userId: 'u1' } as never, entry('u2')],
      isAdminOrDispatcher: true,
    })
    expect(out.map((m) => m.id)).toEqual(['u2'])
  })

  it('gives an employee nothing — the catch-all cards are not theirs', () => {
    const out = buildPresenceDirectory({
      members: [],
      todayEntries: [entry('u1')],
      isAdminOrDispatcher: false,
    })
    expect(out).toEqual([])
  })

  it('returns an empty list rather than throwing when there is no data at all', () => {
    expect(buildPresenceDirectory({ members: [], todayEntries: [], isAdminOrDispatcher: true })).toEqual([])
  })
})
