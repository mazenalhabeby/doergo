/**
 * Pickers ask for people (and letterheads) through the shared hooks, never the
 * ADMIN / canManageUsers endpoints directly — that is how Assign listed nobody
 * for every manager. See lib/assignable-members.ts and lib/org-letterhead.ts.
 */
import fs from "node:fs"
import path from "node:path"

const root = path.join(__dirname, "..")
const readOne = (rel: string) =>
  fs.readFileSync(path.join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
// A path ending in "/" is a SCREEN split across files: every .ts/.tsx directly in that folder.
const read = (rel: string) =>
  rel.endsWith("/")
    ? fs.readdirSync(path.join(root, rel)).filter((f) => /\.tsx?$/.test(f)).sort().map((f) => readOne(rel + f)).join("\n")
    : readOne(rel)

const PICKERS = [
  "components/assign-member-dialog.tsx",
  // The New Task dialog: its people come from its form hook in create-task/.
  "app/(dashboard)/tasks/_components/create-task/",
  "app/(dashboard)/customers/[id]/customer-managers.tsx",
  "app/(dashboard)/customers/[id]/",
  "app/(dashboard)/locations/[id]/_components/apartment-dialog.tsx",
  "components/assets/holder-picker.tsx",
  "components/assets/contract-dialog.tsx",
  "app/(dashboard)/reports/page.tsx",
]
const LETTERHEADS = [
  "app/(dashboard)/invoices/[id]/page.tsx",
  "app/(dashboard)/invoices/[id]/edit/page.tsx",
  "app/(dashboard)/invoices/new/page.tsx",
  "app/(dashboard)/reports/page.tsx",
]

describe("member pickers read people through useAssignableMembers", () => {
  it.each(PICKERS)("%s does not call GET /organizations/members itself", (rel) => {
    const src = read(rel)
    expect(src).not.toMatch(/organizationsApi\.getMembers\(/)
    expect(src).toMatch(/useAssignableMembers\(/)
  })
})

describe("document letterheads come from useOrgLetterhead", () => {
  it.each(LETTERHEADS)("%s does not read the ADMIN-only profile", (rel) => {
    const src = read(rel)
    expect(src).not.toMatch(/organizationsApi\.getProfile\(/)
    expect(src).toMatch(/useOrgLetterhead\(/)
  })
})
