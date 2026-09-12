import fs from "fs"
import path from "path"

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

export const read = (rel: string) => fs.readFileSync(path.join(INVOICES, rel), "utf8")
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

/** The New Invoice screen, as assembled. */
export const createScreen = () => `${code("new/page.tsx")}\n${components()}`

/** The Edit Invoice screen, as assembled. */
export const editScreen = () => `${code("[id]/edit/page.tsx")}\n${components()}`
