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

// A file with the parts moved out of it when it was split (its hook, sections, helpers).
export const read = (rel: string) => readSource(path.join(INVOICES, rel), "utf8")
export const code = (rel: string) => strip(read(rel))

/** Every shared piece an invoice screen is built from. */
export function components(): string {
  const dir = path.join(INVOICES, "_components")
  return fs
    .readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => strip(fs.readFileSync(path.join(dir, f), "utf8")))
    .join("\n")
}

/** Every .ts/.tsx file under a folder, comments stripped, in a stable order. */
function folder(rel: string): string {
  const dir = path.join(INVOICES, rel)
  if (!fs.existsSync(dir)) return ""
  return fs
    .readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f))
    .sort()
    .map((f) => strip(fs.readFileSync(path.join(dir, f), "utf8")))
    .join("\n")
}

/**
 * The New Invoice PAGE — `new/page.tsx` plus the pieces it was split into
 * (`new/_components`, `new/_lib`). These belong to this page alone, so a guard
 * about "this page's sources, gather, grouping" reads them as one.
 */
export const newPage = () => `${code("new/page.tsx")}\n${folder("new/_lib")}\n${folder("new/_components")}`

/**
 * The invoice LIST — `page.tsx` plus the pieces it was split into
 * (`_components/list`, and the formatter in `_lib/list-format.ts`). Kept out of
 * `components()`, which is the shared invoice-document screen.
 */
export const listPage = () => `${code("page.tsx")}\n${folder("_components/list")}\n${code("_lib/list-format.ts")}`

/** The New Invoice screen, as assembled. */
export const createScreen = () => `${newPage()}\n${components()}`

/** The Edit Invoice screen, as assembled. */
export const editScreen = () => `${code("[id]/edit/page.tsx")}\n${components()}`
