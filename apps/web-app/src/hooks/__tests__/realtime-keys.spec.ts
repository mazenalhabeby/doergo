import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Every query key a socket event invalidates must match a query that exists.
 *
 * This is the failure mode Pass D of the audit was written around, and it is
 * genuinely easy to hit: `invalidateQueries` never throws on a key nothing uses.
 * The wiring looks complete, the event fires, and the screen does not move. It had
 * already happened once in this codebase (`attendance-today`), and it happened
 * again while fixing the CRM: `["customers"]` is the obvious name for the clients
 * list and the list is actually `["my-clients"]`, so the invalidation would have
 * been silently inert.
 *
 * The check is deliberately loose about the REST of a key — real keys carry
 * arguments (`["customer", id]`, `["attendance", loc, status, …]`) and
 * `invalidateQueries` matches on prefix. Only the first segment has to exist.
 */
describe('use-realtime-sync invalidation keys are real', () => {
  const SRC = join(__dirname, '..', '..')

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const full = join(dir, e)
      if (statSync(full).isDirectory()) return e === 'node_modules' ? [] : walk(full)
      return /\.tsx?$/.test(full) ? [full] : []
    })

  const allSource = walk(SRC)
    .filter((f) => !f.includes('__tests__'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')

  /** First segment of every key listed in EVENT_INVALIDATIONS / MEMBER_KEYS / the *_KEYS lists. */
  // Comments stripped: the file explains this very trap in prose, and a scanner
  // that counts prose as code reports the documentation as the bug.
  const sync = readFileSync(join(SRC, 'hooks', 'use-realtime-sync.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const declared = [...new Set(
    [...sync.matchAll(/\[\s*"([a-zA-Z][\w-]*)"[^\]]*\]/g)].map((m) => m[1]!),
  )]

  /** Every first segment actually used by a useQuery in the app. */
  const used = new Set(
    [...allSource.matchAll(/queryKey:\s*\[\s*"([a-zA-Z][\w-]*)"/g)].map((m) => m[1]!),
  )

  it('finds both sides — a silent zero would make this suite meaningless', () => {
    expect(declared.length).toBeGreaterThan(10)
    expect(used.size).toBeGreaterThan(20)
  })

  it('every invalidated key matches at least one real query', () => {
    const phantom = declared.filter((k) => !used.has(k))
    expect(phantom).toEqual([])
  })
})
