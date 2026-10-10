import fs from "fs"
import path from "path"

/**
 * The navigation BAR, not the file.
 *
 * `components/top-navbar.tsx` is the entry (importers did not change) and the
 * menus, the active-link rule, the styles and the prefetch hook live in
 * `components/top-navbar/`. The guards that read the bar protect what a person
 * sees, so they read the entry PLUS every piece it is assembled from — the same
 * pattern as `invoices/__tests__/_screen.ts`.
 */
export function readNavbar(): string {
  const components = path.join(__dirname, "..", "components")
  const dir = path.join(components, "top-navbar")
  return [
    path.join(components, "top-navbar.tsx"),
    ...fs
      .readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .sort()
      .map((f) => path.join(dir, f)),
  ]
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n")
}
