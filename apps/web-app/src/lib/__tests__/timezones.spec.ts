import { allTimezones, tzOffset, FALLBACK_TIMEZONES } from '@/lib/timezones'

describe('timezones', () => {
  it('lists the zones the runtime knows', () => {
    const all = allTimezones()
    expect(all).toContain('Europe/Vienna')
    expect(all.length).toBeGreaterThanOrEqual(FALLBACK_TIMEZONES.length)
  })

  it('reads the offset on a given day, DST included', () => {
    expect(tzOffset('Europe/Vienna', new Date('2026-01-15T12:00:00Z'))).toBe('UTC+1')
    expect(tzOffset('Europe/Vienna', new Date('2026-07-15T12:00:00Z'))).toBe('UTC+2')
    expect(tzOffset('Asia/Kolkata', new Date('2026-07-15T12:00:00Z'))).toBe('UTC+5:30')
    expect(tzOffset('UTC')).toBe('UTC')
  })

  it('is empty for a zone that does not exist', () => {
    expect(tzOffset('Mars/Olympus')).toBe('')
  })
})
