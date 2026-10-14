/**
 * Hours recorded without signal — the flag the server sets, read once.
 * (The Attendance › Approvals tab that filtered on it is gone: hours are decided
 * in Approvals, which shows the flag on the item.)
 */
import { recordedOffline } from '../attendance-status'

describe('approvals: recorded offline', () => {
  it('reads the flag the server sets', () => {
    expect(recordedOffline({ flagReasons: ['LATE_ARRIVAL', 'RECORDED_OFFLINE'] })).toBe(true)
    expect(recordedOffline({ flagReasons: ['LATE_ARRIVAL'] })).toBe(false)
    expect(recordedOffline({ flagReasons: null })).toBe(false)
  })
})
