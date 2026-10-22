import * as fs from "fs"
import * as path from "path"

/**
 * A source file as the guard tests read it: its own text PLUS the parts that were moved out of it
 * when it was split (2026-10-17) — its `use…` hook, its sections, its helpers. They are found by
 * following the file"s relative imports to files that carry the split"s marker, "moved here
 * unchanged", so a guard keeps seeing the code it was written against, wherever it now lives.
 * Any other file reads exactly as `fs.readFileSync` would.
 */
const MARKER = "moved here unchanged"
const EXT = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

export function readSource(file: string, encoding: BufferEncoding = "utf8"): string {
  return collect(String(file), encoding, new Set())
}

function collect(file: string, encoding: BufferEncoding, seen: Set<string>): string {
  seen.add(path.resolve(file))
  const text = fs.readFileSync(file, encoding)
  if (!/\.tsx?$/.test(file)) return text
  const parts: string[] = []
  for (const m of text.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = path.resolve(path.dirname(file), m[1]!)
    const hit = EXT.map((e) => base + e).find((p) => fs.existsSync(p) && fs.statSync(p).isFile())
    if (!hit || seen.has(hit)) continue
    const head = fs.readFileSync(hit, "utf8")
    if (head.includes(MARKER)) parts.push(collect(hit, encoding, seen))
  }
  return [text, ...parts].join("\n")
}

/**
 * A route (or a component folder) as one screen: every .ts/.tsx under it, its `_components/`,
 * `_hooks/` and `_lib/` included, tests excluded — sorted, so a guard reads the same text every run.
 */
export function readFolder(dir: string, encoding: BufferEncoding = "utf8"): string {
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name)
      if (e.isDirectory()) return e.name.startsWith("__") ? [] : walk(p)
      return /\.tsx?$/.test(e.name) && !/\.(spec|test)\.tsx?$/.test(e.name) ? [p] : []
    })
  return walk(dir)
    .sort()
    .map((f) => fs.readFileSync(f, encoding))
    .join("\n")
}
