import { addDays, diffDays, isSameDay, isWeekend, startOfDay } from '../local-days'

describe('local day arithmetic', () => {
  it('startOfDay is local midnight and leaves its argument alone', () => {
    const at = new Date(2026, 9, 11, 15, 42, 7)
    const day = startOfDay(at)
    expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours(), day.getMinutes()]).toEqual([2026, 9, 11, 0, 0])
    expect(at.getHours()).toBe(15)
  })

  it('addDays crosses months and goes backwards', () => {
    expect(addDays(new Date(2026, 0, 31), 1).getMonth()).toBe(1)
    expect(addDays(new Date(2026, 2, 1), -1).getDate()).toBe(28)
  })

  it('diffDays counts whole days, either way round', () => {
    expect(diffDays(new Date(2026, 9, 20), new Date(2026, 9, 11))).toBe(9)
    expect(diffDays(new Date(2026, 9, 11), new Date(2026, 9, 20))).toBe(-9)
  })

  it('isSameDay ignores the time, isWeekend is Saturday and Sunday', () => {
    expect(isSameDay(new Date(2026, 9, 11, 1), new Date(2026, 9, 11, 23))).toBe(true)
    expect(isSameDay(new Date(2026, 9, 11), new Date(2026, 9, 12))).toBe(false)
    expect(isWeekend(new Date(2026, 9, 10))).toBe(true) // Saturday
    expect(isWeekend(new Date(2026, 9, 11))).toBe(true) // Sunday
    expect(isWeekend(new Date(2026, 9, 12))).toBe(false)
  })
})
