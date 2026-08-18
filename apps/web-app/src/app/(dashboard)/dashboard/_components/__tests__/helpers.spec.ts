import { getTodayString, isClockedIn } from '../helpers'

/**
 * getTodayString keys the attendance query. It used to format via toISOString(),
 * i.e. UTC, so east of Greenwich it asked the server for YESTERDAY until the UTC
 * day rolled over — the reason a member's own shift was missing before 02:00.
 */
describe('getTodayString', () => {
  const realDate = Date

  afterEach(() => {
    global.Date = realDate
  })

  /** Freeze "now" to a fixed instant, interpreted in the runtime's local zone. */
  function freeze(iso: string) {
    const fixed = new realDate(iso)
    class FrozenDate extends realDate {
      constructor(...args: unknown[]) {
        super(...(args.length ? (args as []) : [fixed.getTime()]))
      }
      static now() {
        return fixed.getTime()
      }
    }
    global.Date = FrozenDate as unknown as DateConstructor
  }

  it('formats as YYYY-MM-DD', () => {
    expect(getTodayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('reports the LOCAL calendar day, not the UTC one', () => {
    // 00:30 local on the 18th. In any zone ahead of UTC this instant is still
    // the 17th in UTC — the old implementation returned the 17th here.
    freeze('2026-08-18T00:30:00')
    const now = new Date()
    const expected = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`
    expect(getTodayString()).toBe(expected)
  })

  it('zero-pads single-digit months and days', () => {
    freeze('2026-01-05T12:00:00')
    expect(getTodayString()).toBe('2026-01-05')
  })
})

describe('isClockedIn', () => {
  it('is true only for an open session', () => {
    expect(isClockedIn({ status: 'CLOCKED_IN', clockOutAt: null } as never)).toBe(true)
  })

  it('is false once clocked out, even if the status lags', () => {
    expect(isClockedIn({ status: 'CLOCKED_IN', clockOutAt: '2026-08-18T10:00:00Z' } as never)).toBe(false)
    expect(isClockedIn({ status: 'CLOCKED_OUT', clockOutAt: null } as never)).toBe(false)
  })
})
