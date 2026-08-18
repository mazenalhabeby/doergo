import type { TimeEntry } from '@/lib/api'

import { deriveAttendanceFlags, deriveAttendanceState } from '../attendance-status'

/**
 * The status column used to render `clockInWithinGeofence`, which no normal code
 * path ever sets to false — so every row read "In Zone". These cover the states
 * it reports instead, and the ordering guarantees the UI relies on.
 */

const entry = (over: Partial<TimeEntry> = {}): TimeEntry =>
  ({ id: 'e1', status: 'CLOCKED_OUT', approvalStatus: 'AUTO', flagReasons: [], ...over }) as TimeEntry

describe('deriveAttendanceState', () => {
  it('reports an open session as Active regardless of approval state', () => {
    const s = deriveAttendanceState(entry({ status: 'CLOCKED_IN', approvalStatus: 'PENDING' }))
    expect(s.key).toBe('active')
    expect(s.tone).toBe('green')
  })

  it.each([
    ['PENDING', 'pending', 'amber'],
    ['APPROVED', 'approved', 'blue'],
    ['REJECTED', 'rejected', 'red'],
    ['AUTO', 'auto-approved', 'green'],
  ])('maps a closed %s entry to %s', (approvalStatus, key, tone) => {
    const s = deriveAttendanceState(entry({ approvalStatus: approvalStatus as never }))
    expect(s.key).toBe(key)
    expect(s.tone).toBe(tone)
  })

  it('falls back to auto-approved for an unrecognised approval state', () => {
    expect(deriveAttendanceState(entry({ approvalStatus: 'WEIRD' as never })).key).toBe('auto-approved')
  })

  it('always carries an English fallback, so a missing translation never blanks the cell', () => {
    expect(deriveAttendanceState(entry()).fallback).toBeTruthy()
  })
})

describe('deriveAttendanceFlags', () => {
  it('returns nothing for a clean entry', () => {
    expect(deriveAttendanceFlags(entry())).toEqual([])
  })

  it('tolerates a missing flagReasons field', () => {
    expect(deriveAttendanceFlags(entry({ flagReasons: undefined as never }))).toEqual([])
  })

  it('orders by severity, not by the order the server happened to store them', () => {
    const flags = deriveAttendanceFlags(
      entry({ flagReasons: ['UNSCHEDULED_DAY', 'LATE_ARRIVAL', 'MISSED_CLOCK_OUT'] }),
    )
    expect(flags.map((f) => f.key)).toEqual(['MISSED_CLOCK_OUT', 'LATE_ARRIVAL', 'UNSCHEDULED_DAY'])
  })

  it('is stable: the same reasons in a different order give the same output', () => {
    const a = deriveAttendanceFlags(entry({ flagReasons: ['OVERTIME', 'LATE_ARRIVAL'] }))
    const b = deriveAttendanceFlags(entry({ flagReasons: ['LATE_ARRIVAL', 'OVERTIME'] }))
    expect(a.map((f) => f.key)).toEqual(b.map((f) => f.key))
  })

  it('still surfaces a flag the frontend does not know yet, humanised', () => {
    const [chip] = deriveAttendanceFlags(entry({ flagReasons: ['SOME_NEW_FLAG'] }))
    expect(chip.key).toBe('SOME_NEW_FLAG')
    expect(chip.fallback).toBe('Some new flag')
    expect(chip.tone).toBe('muted')
  })

  it('keeps known flags ahead of unknown ones', () => {
    const flags = deriveAttendanceFlags(entry({ flagReasons: ['SOME_NEW_FLAG', 'OVERTIME'] }))
    expect(flags.map((f) => f.key)).toEqual(['OVERTIME', 'SOME_NEW_FLAG'])
  })
})
