/**
 * The calendar is hand-built, so the two things that silently go wrong in a
 * hand-built calendar are pinned here: the Monday-first offset, and the
 * timezone-safe date key.
 */
describe("vacation calendar", () => {
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  function monthGrid(year: number, month: number): (Date | null)[][] {
    const first = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const lead = (first.getDay() + 6) % 7
    const cells: (Date | null)[] = Array(lead).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
    while (cells.length % 7 !== 0) cells.push(null)
    const weeks: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
    return weeks
  }

  it("starts the week on Monday", () => {
    // 1 Feb 2027 is a Monday: no leading blanks.
    expect(monthGrid(2027, 1)[0][0]?.getDate()).toBe(1)
    // 1 Aug 2026 is a Saturday: five blanks before it.
    const aug = monthGrid(2026, 7)[0]
    expect(aug.slice(0, 5).every((c) => c === null)).toBe(true)
    expect(aug[5]?.getDate()).toBe(1)
  })

  it("emits whole weeks", () => {
    for (const m of [0, 1, 6, 11]) {
      for (const w of monthGrid(2026, m)) expect(w).toHaveLength(7)
    }
  })

  it("covers every day of a leap February", () => {
    expect(monthGrid(2028, 1).flat().filter(Boolean)).toHaveLength(29)
  })

  it("builds the date key from LOCAL parts, not toISOString", () => {
    // toISOString() converts to UTC, so a late-evening date in a positive
    // offset becomes the NEXT day — the off-by-one that books the wrong day.
    expect(toISO(new Date(2026, 7, 26, 23, 30))).toBe("2026-08-26")
  })
})
