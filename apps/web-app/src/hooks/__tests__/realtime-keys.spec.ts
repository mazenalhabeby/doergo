import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { keys } from '@/lib/query-keys'

/**
 * Every query key an invalidation names must match a query that exists.
 *
 * This is the failure mode Pass D of the audit was written around, and it is
 * genuinely easy to hit: `invalidateQueries` never throws on a key nothing uses.
 * The wiring looks complete, the event fires, and the screen does not move. It
 * happened with `attendance-today`, with `["customers"]` while fixing the CRM,
 * and — found when every key moved into lib/query-keys.ts — with eleven more:
 * the rest panel invalidated three keys no screen read, so a rest started there
 * appeared a minute later; `["availability"]` was the key of a calendar that no
 * longer exists, and both leave helpers and two socket events still named it.
 *
 * Keys are built by the factories in lib/query-keys.ts, so the check EVALUATES
 * them: each factory is called with placeholder arguments, and the leading
 * literal parts of the result are what an invalidation can match on. An
 * invalidation reaches a query when one of those prefixes extends the other.
 */
const SRC = join(__dirname, '..', '..')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e)
    if (statSync(full).isDirectory()) return e === 'node_modules' || e === '__tests__' ? [] : walk(full)
    return /\.tsx?$/.test(full) ? [full] : []
  })

/** Comments stripped: these files explain the trap in prose, and prose is not a key. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const files = walk(SRC).map((f) => ({ f, src: code(readFileSync(f, 'utf8')) }))

const PLACEHOLDER = '\u0000arg'

/** The literal head of the key a factory builds, whatever it is called with. */
function staticHead(domain: string, name: string): string[] {
  const factory = (keys as unknown as Record<string, Record<string, (...a: unknown[]) => readonly unknown[]>>)[domain]?.[name]
  if (!factory) throw new Error(`keys.${domain}.${name} does not exist`)
  const value = factory(...Array.from({ length: 6 }, (_, i) => `${PLACEHOLDER}${i}`))
  const head: string[] = []
  for (const part of value) {
    if (typeof part !== 'string' || part.startsWith(PLACEHOLDER)) break
    head.push(part)
  }
  return head
}

const reaches = (a: string[], b: string[]) => {
  const n = Math.min(a.length, b.length)
  return a.slice(0, n).every((p, i) => p === b[i])
}

const FACTORY = /\bkeys\.(\w+)\.(\w+)\(/g
const INVALIDATION_BEFORE = /(?:invalidate|refetch|reset|remove|cancel)Queries\(\s*\{\s*queryKey:\s*$/

/**
 * What the app READS: every factory call outside the realtime map and outside an
 * invalidation. Lenient on purpose — a key built into a list (`logbookKeys`) or
 * behind a helper (`roleQueryKey`) counts as read; what this cannot forgive is a
 * family nothing anywhere builds except to invalidate it.
 */
const readHeads: string[][] = []
for (const { f, src } of files) {
  if (f.endsWith(join('lib', 'query-keys.ts')) || f.endsWith(join('hooks', 'use-realtime-sync.ts'))) continue
  for (const m of src.matchAll(FACTORY)) {
    if (INVALIDATION_BEFORE.test(src.slice(Math.max(0, m.index! - 60), m.index!))) continue
    readHeads.push(staticHead(m[1]!, m[2]!))
  }
}

const phantoms = (heads: Array<{ where: string; head: string[] }>) =>
  heads.filter(({ head }) => !readHeads.some((r) => reaches(head, r))).map(({ where }) => where)

describe('invalidation keys are real', () => {
  it('finds both sides — a silent zero would make this suite meaningless', () => {
    expect(readHeads.length).toBeGreaterThan(200)
  })

  it('every key a socket event invalidates is read by some query', () => {
    const sync = files.find(({ f }) => f.endsWith(join('hooks', 'use-realtime-sync.ts')))!.src
    const declared = [...sync.matchAll(FACTORY)].map((m) => ({ where: `keys.${m[1]}.${m[2]}()`, head: staticHead(m[1]!, m[2]!) }))
    expect(declared.length).toBeGreaterThan(40)
    expect(phantoms(declared)).toEqual([])
  })

  it('every key a write invalidates is read by some query', () => {
    const invalidated: Array<{ where: string; head: string[] }> = []
    for (const { f, src } of files) {
      if (f.endsWith(join('hooks', 'use-realtime-sync.ts'))) continue
      for (const m of src.matchAll(FACTORY)) {
        if (!INVALIDATION_BEFORE.test(src.slice(Math.max(0, m.index! - 60), m.index!))) continue
        invalidated.push({ where: `${f.slice(SRC.length + 1)}: keys.${m[1]}.${m[2]}`, head: staticHead(m[1]!, m[2]!) })
      }
    }
    expect(invalidated.length).toBeGreaterThan(100)
    expect(phantoms(invalidated)).toEqual([])
  })
})
