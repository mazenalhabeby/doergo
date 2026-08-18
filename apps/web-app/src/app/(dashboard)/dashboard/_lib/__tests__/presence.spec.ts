import { ONLINE_WINDOW_MS, getEmployeeStatus, isOnline, memberToPersonNode } from '../presence'

/**
 * The precedence here is easy to get wrong and invisible until someone is
 * mislabelled on the board: offline wins only when they are also off the clock;
 * a break outranks everything while on the clock; a deliberately-set
 * availability outranks the clock label; and where they clocked in decides
 * On Shift vs In Field vs Working.
 */

const base = { isClockedIn: false, isOnBreak: false, isOnline: true }

describe('getEmployeeStatus', () => {
  it('is Off only when neither app-active nor clocked in', () => {
    expect(getEmployeeStatus({ ...base, isOnline: false }).status).toBe('off')
  })

  it('is NOT Off for someone clocked in but not app-active — the clock is server state', () => {
    expect(getEmployeeStatus({ ...base, isOnline: false, isClockedIn: true }).status).not.toBe('off')
  })

  it('shows a break ahead of any availability the member set', () => {
    const r = getEmployeeStatus({ ...base, isClockedIn: true, isOnBreak: true, presence: 'BUSY' })
    expect(r.status).toBe('on')
    expect(r.tag?.variant).toBe('hrs')
  })

  it('lets a deliberately-set Busy/Away override the clock label', () => {
    expect(getEmployeeStatus({ ...base, isClockedIn: true, presence: 'BUSY' }).status).toBe('busy')
    expect(getEmployeeStatus({ ...base, isClockedIn: true, presence: 'AWAY' }).status).toBe('away')
  })

  it('labels a remote clock-in as remote regardless of the space model', () => {
    const r = getEmployeeStatus({ ...base, isClockedIn: true, isRemote: true, isShiftBased: true })
    expect(r.status).toBe('on')
    expect(r.tag?.variant).toBe('task')
  })

  it('calls a non-shift space simply Working', () => {
    const r = getEmployeeStatus({ ...base, isClockedIn: true, isShiftBased: false })
    expect(r.tag?.variant).toBe('hrs')
  })

  it('distinguishes On Shift (inside the geofence) from In Field (not confirmed)', () => {
    const onShift = getEmployeeStatus({ ...base, isClockedIn: true, isShiftBased: true, atSpace: true })
    const inField = getEmployeeStatus({ ...base, isClockedIn: true, isShiftBased: true, atSpace: false })
    expect(onShift.tag?.variant).toBe('hrs')
    expect(inField.tag?.variant).toBe('task')
    expect(onShift.tag?.text).not.toBe(inField.tag?.text)
  })

  it('treats someone online but off the clock as available, not off', () => {
    const r = getEmployeeStatus(base)
    expect(r.status).toBe('on')
  })

  it('always returns a label when it returns a tag', () => {
    const r = getEmployeeStatus({ ...base, isClockedIn: true })
    expect(r.tag?.text).toBeTruthy()
  })
})

describe('isOnline', () => {
  it('is false without a timestamp', () => {
    expect(isOnline(null)).toBe(false)
    expect(isOnline(undefined)).toBe(false)
  })

  it('is true just inside the window and false just outside it', () => {
    const inside = new Date(Date.now() - (ONLINE_WINDOW_MS - 5_000)).toISOString()
    const outside = new Date(Date.now() - (ONLINE_WINDOW_MS + 5_000)).toISOString()
    expect(isOnline(inside)).toBe(true)
    expect(isOnline(outside)).toBe(false)
  })
})

describe('memberToPersonNode', () => {
  const member = {
    id: 'u1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: 'EMPLOYEE',
    avatarUrl: null,
  } as never

  it('abbreviates the surname and keeps the id for navigation', () => {
    const node = memberToPersonNode(member, 'on')
    expect(node.name).toBe('Ada L.')
    expect(node.userId).toBe('u1')
  })

  it('reports a non-employee as Admin', () => {
    const admin = { ...(member as object), role: 'ADMIN' } as never
    expect(memberToPersonNode(admin, 'on').role).toBe('Admin')
  })

  it('defaults clockedIn to false so the ring is opt-in', () => {
    expect(memberToPersonNode(member, 'on').clockedIn).toBe(false)
    expect(memberToPersonNode(member, 'on', undefined, undefined, true).clockedIn).toBe(true)
  })

  it('survives a member with no surname', () => {
    const solo = { ...(member as object), lastName: '' } as never
    expect(memberToPersonNode(solo, 'on').name).toBe('Ada')
  })
})
