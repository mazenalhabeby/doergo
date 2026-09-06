import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Every screen that shows how long somebody worked must agree.
 *
 * `workedMinutes()` is the one helper that decides it: it prefers the counted
 * figure the server stamped at clock-out — early arrival clamped off, approved
 * overtime included, unpaid rests subtracted — and falls back to the old
 * arithmetic for entries closed before that existed.
 *
 * This exists because the member's attendance tab did its own sum from
 * `totalMinutes` while the attendance board called the helper, so one shift
 * read 12h 10m on one screen and 11h 30m on the other. Whichever page somebody
 * happened to open decided what they believed they were paid for.
 */
describe('hours worked come from one helper', () => {
  const SRC = join(__dirname, '..')

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name)
      if (name === 'node_modules' || name === '__tests__') return []
      if (statSync(p).isDirectory()) return walk(p)
      return /\.tsx?$/.test(name) ? [p] : []
    })

  /**
   * Reading the raw field OFF AN ENTRY and dividing it into hours.
   *
   * Deliberately requires the dot. An early version matched the bare word and
   * flagged a local accumulator that had already been summed correctly — a
   * guard that cannot tell `entry.totalMinutes / 60` from `total / 60` teaches
   * people to silence it, and a silenced guard catches nothing.
   */
  const INLINE_MATH = /\.(totalMinutes|paidMinutes)\b[^\n]{0,40}\/\s*60/

  it('nothing renders a duration by dividing a raw minutes field', () => {
    const offenders: string[] = []

    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8')
      // Only files that deal in time entries at all.
      if (!/TimeEntry|attendance/i.test(src)) continue
      // Strip comments, so a comment ABOUT the bug is not read as the bug.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      if (!INLINE_MATH.test(code)) continue
      offenders.push(file.slice(SRC.length + 1))
    }

    expect(offenders).toEqual([])
  })

  it('the two member-facing surfaces both call it', () => {
    // Named directly: these are the two that disagreed, and a regression in
    // either is the one this suite exists to catch.
    for (const rel of [
      'app/(dashboard)/attendance/_components/tracking-tab.tsx',
      'app/(dashboard)/members/[id]/_components/attendance-tab.tsx',
    ]) {
      expect(readFileSync(join(SRC, rel), 'utf8')).toContain('workedMinutes(entry)')
    }
  })
})
