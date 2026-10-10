/**
 * A distance on the web is said through the ONE formatter — never built by hand.
 *
 * The rules ("85 m", "1.2 km", "9,631 km", per locale) live once in
 * `packages/shared/src/utils/distance.ts`; screens reach them through
 * `hooks/use-format-distance.ts` (or `formatDistance` with a locale). The
 * phone's `apps/mobile/src/lib/__tests__/distance-display-guard.spec.ts` reads
 * this source too, but it only runs in the MOBILE suite — so a web-only change
 * could put "1234m" back on a screen with the web's own tests all green. This
 * is the same check, run where the web's changes are tested.
 *
 * It cannot read intent, so a legitimate non-display use (a speed, the readout
 * of an input the admin types metres into) is ALLOWED BY NAME below, each with
 * its reason — adding one is a decision somebody can see in review.
 */
import fs from "fs"
import path from "path"

const WEB_SRC = path.join(__dirname, "../..")
const LOCALES = path.join(WEB_SRC, "i18n/locales")

/** Legitimate, named: `file` (relative to apps/web-app/src) + a fragment of the offending line + why. */
const ALLOWED: { file: string; contains: string; why: string }[] = [
  { file: "app/(dashboard)/tasks/[id]/_components/route-tracking-section.tsx", contains: "const km = distanceMeters / 1000", why: "average SPEED (km/h), not a distance shown" },
  { file: "app/(dashboard)/locations/_components/space-form.tsx", contains: "{radius}m", why: "the readout of the radius INPUT slider — the admin sets metres" },
]

const RULES: { name: string; re: RegExp; ext?: RegExp }[] = [
  // "km/h" is a speed, not a distance.
  { name: 'unit "km" glued to an interpolation', re: /\$\{[^}]*\}\s?km\b(?!\/h)/ },
  { name: 'toFixed then "km"', re: /toFixed\(\d\)\s*\}?\s*`?\s*\+?\s*['"`]?\s?km\b/ },
  { name: '"/ 1000" beside "km"', re: /\/\s?1000\b[^\n]*\bkm\b(?!\/h)|\bkm\b[^\n]*\/\s?1000\b/ },
  {
    name: 'a distance-named value followed by "m"',
    re: /\$\{[^}]*(?:distance|Distance|metres|Metres|meters|Meters|radius|Radius|away|Away)[^}]*\}\s?m(?![\p{L}\d])/u,
  },
  {
    name: 'JSX: a distance-named value followed by "m"/"km"',
    re: /(?<!\$)\{[^{}]*\b(?:distance\w*|\w*[mM]etres|\w*[mM]eters|radius)\b[^{}]*\}\s?(?:m|km)(?![\p{L}\d])/u,
    ext: /\.tsx$/,
  },
]

function* sourceFiles(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* sourceFiles(p)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(spec|test)\.tsx?$/.test(e.name)) yield p
  }
}

/** Comments may talk about "1701 km"; only code is judged. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, "$1"))
    .join("\n")
}

function offencesIn(rel: string, src: string): string[] {
  const found: string[] = []
  stripComments(src).split("\n").forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.ext && !rule.ext.test(rel)) continue
      if (!rule.re.test(line)) continue
      if (ALLOWED.some((a) => a.file === rel && line.includes(a.contains))) continue
      found.push(`${rel}:${i + 1} — ${rule.name}: ${line.trim()}`)
    }
  })
  return found
}

function offences(): string[] {
  const found: string[] = []
  for (const abs of sourceFiles(WEB_SRC)) {
    const rel = path.relative(WEB_SRC, abs).split(path.sep).join("/")
    found.push(...offencesIn(rel, fs.readFileSync(abs, "utf8")))
  }
  return found
}

/** Locale strings: the unit comes with the formatted value, so it must not be in the sentence. */
function localeOffences(): string[] {
  const found: string[] = []
  for (const f of fs.readdirSync(LOCALES).filter((n) => n.endsWith(".json"))) {
    fs.readFileSync(path.join(LOCALES, f), "utf8").split("\n").forEach((line, i) => {
      if (/\{\{(?:distance|radius|span)\}\}\s?-?(?:m|km)(?![\p{L}\d])/u.test(line)) found.push(`${f}:${i + 1}: ${line.trim()}`)
    })
  }
  return found
}

describe("web distances are said through the one formatter", () => {
  it("finds the source it is meant to read", () => {
    expect([...sourceFiles(WEB_SRC)].length).toBeGreaterThan(300)
  })

  it("no web screen builds a distance by hand", () => {
    expect(offences()).toEqual([])
  })

  it('no translated sentence carries its own "m"/"km" after a distance placeholder', () => {
    expect(localeOffences()).toEqual([])
  })

  it("every allowed exception still exists — a stale entry would hide a new one", () => {
    const stale = ALLOWED.filter((a) => {
      const p = path.join(WEB_SRC, a.file)
      return !fs.existsSync(p) || !fs.readFileSync(p, "utf8").includes(a.contains)
    })
    expect(stale).toEqual([])
  })

  it("the rules catch what they are for (planted), and leave durations and speeds alone", () => {
    const planted = [
      "const s = `You are ${away}m from the job site`",
      "const s = `${(m / 1000).toFixed(1)} km`",
      "return `${km(leg.meters)} km`",
      "const label = `${distance}m`",
    ]
    for (const line of planted) expect([line, offencesIn("x.ts", line).length > 0]).toEqual([line, true])
    expect(offencesIn("x.tsx", "<span>{distanceM}m</span>").length).toBeGreaterThan(0)
    expect(offencesIn("x.tsx", "<span>{radius} km</span>").length).toBeGreaterThan(0)
    expect(offencesIn("x.ts", "return `${h}h ${m}m`")).toEqual([])
    expect(offencesIn("x.ts", "return `${Math.round(speed)} km/h`")).toEqual([])
    // A comment may talk about distances.
    expect(offencesIn("x.ts", "// e.g. `${distance}m` was the old way")).toEqual([])
  })
})
