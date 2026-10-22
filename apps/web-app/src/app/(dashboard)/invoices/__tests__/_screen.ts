import fs from "fs"
import path from "path"
import { readSource } from "../../../../test-utils/read-source"

/**
 * The SCREEN, not the file.
 *
 * ⚠️ These guards used to read `new/page.tsx` alone, and that was only ever
 * true by accident: the page happened to be one 1,500-line file. The moment the
 * shell, the fields and the document moved into `_components/` — so that
 * creating an invoice and correcting one could be the same screen — every
 * assertion about the client's copy, the sticky bar and the rail started
 * looking at a file that no longer contains them.
 *
 * The property being protected is about what a person sees, so the source it is
 * asserted against is the page PLUS the components it is assembled from. That
 * also means one guard now covers both screens, which is exactly the thing this
 * refactor was for.
 */

const INVOICES = path.join(__dirname, "..")

/*
  Code only — the comment opener must follow whitespace OR a brace. A string
  holding a slash-star (a media type) opens a comment as far as a regex is
  concerned; requiring whitespace alone stops JSX comments being stripped, since
  those open as brace-slash-star. Both traps have been fallen into here.
*/
export const strip = (src: string) =>
  src.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:/])\/\/[^\n]*/g, "$1")

/** A route's own pieces, beside its `page.tsx`. */
const PRIVATE = ["_hooks", "_components", "_lib"]

/**
 * A file — or, for a nested route's `page.tsx`, the SCREEN: the page plus its own `_hooks/`,
 * `_components/` and `_lib/`, which is where its state, its bar and its rules live. (The list's
 * `page.tsx` is read through `listPage()`, which says which of the shared folders are its own.)
 */
export const read = (rel: string) => {
  const src = readSource(path.join(INVOICES, rel), "utf8")
  if (!rel.endsWith("/page.tsx")) return src
  const dir = path.dirname(rel)
  return [src, ...PRIVATE.map((d) => rawFolder(path.join(dir, d)))].join("\n")
}
export const code = (rel: string) => strip(read(rel))

/** The invoice document — the component and the two frames it renders. */
export const documentCode = () =>
  ["invoice-document.tsx", "working-sheet.tsx", "client-copy.tsx"].map((f) => code(`_components/${f}`)).join("\n")

/** Every shared piece an invoice screen is built from. */
export function components(): string {
  const dir = path.join(INVOICES, "_components")
  return fs
    .readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => strip(fs.readFileSync(path.join(dir, f), "utf8")))
    .join("\n")
}

/** Every .ts/.tsx file directly in a folder, in a stable order. */
function rawFolder(rel: string): string {
  const dir = path.join(INVOICES, rel)
  if (!fs.existsSync(dir)) return ""
  return fs
    .readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n")
}

/** The same, comments stripped. */
const folder = (rel: string) => strip(rawFolder(rel))

/**
 * The New Invoice PAGE — `new/page.tsx` plus its own pieces (`new/_hooks`,
 * `new/_components`, `new/_lib`). These belong to this page alone, so a guard
 * about "this page's sources, gather, grouping" reads them as one.
 */
export const newPage = () => code("new/page.tsx")

/**
 * The invoice LIST — `page.tsx`, its state (`_hooks`), its pieces (`_components/list`) and the
 * formatter in `_lib/list-format.ts`. Kept out of `components()`, which is the shared
 * invoice-document screen.
 */
export const listPage = () =>
  `${code("page.tsx")}\n${folder("_hooks")}\n${folder("_components/list")}\n${code("_lib/list-format.ts")}`

/** The New Invoice screen, as assembled. */
export const createScreen = () => `${newPage()}\n${components()}`

/** The Edit Invoice screen, as assembled. */
export const editScreen = () => `${code("[id]/edit/page.tsx")}\n${components()}`
