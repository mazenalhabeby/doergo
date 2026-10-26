import fs from "fs"
import path from "path"

/**
 * The navigation, not one file.
 *
 * The shell's menu is assembled from `components/app-shell/` (the top bar, the inbox buttons, the account
 * menu) plus its `nav/` (the menu as data, the access filter, the active-row rule) and `sidebar/` folders. The
 * guards that read the navigation protect what a person sees, so they read ALL of it — the same pattern as
 * `invoices/__tests__/_screen.ts`.
 */
export function readNavbar(): string {
  const root = path.join(__dirname, "..", "components", "app-shell")
  return [root, path.join(root, "nav"), path.join(root, "sidebar")]
    .flatMap((dir) =>
      fs
        .readdirSync(dir)
        .filter((f) => /\.tsx?$/.test(f))
        .sort()
        .map((f) => path.join(dir, f)),
    )
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n")
}
