/**
 * Pickers ask for people (and letterheads) through the shared hooks, never the
 * ADMIN / canManageUsers endpoints directly — that is how Assign listed nobody
 * for every manager. See lib/assignable-members.ts and lib/org-letterhead.ts.
 */
import fs from "node:fs"
import path from "node:path"
import { readFolder, readSource } from "../test-utils/read-source"

const root = path.join(__dirname, "..")
const readOne = (rel: string) =>
  readSource(path.join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
// A path ending in "/" is a SCREEN split across files: every .ts/.tsx under that folder (tests excluded).
const read = (rel: string) =>
  rel.endsWith("/")
    ? readFolder(path.join(root, rel)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    : readOne(rel)

const PICKERS = [
  // The Assign dialog: its people come from its selection hook.
  "components/tasks/use-assign-member-dialog.ts",
  // The New Task dialog: its people come from its form hook in create-task/.
  "components/tasks/create-task/",
  "app/(dashboard)/clients/[id]/_components/customer-managers.tsx",
  "app/(dashboard)/clients/[id]/",
  "app/(dashboard)/locations/[id]/_components/apartment-dialog.tsx",
  "components/assets/holder-picker.tsx",
  "components/assets/use-contract-dialog.ts",
  "app/(dashboard)/reports/_hooks/use-report-builder.ts",
]
const LETTERHEADS = [
  "app/(dashboard)/invoices/[id]/",
  "app/(dashboard)/invoices/[id]/edit/",
  "app/(dashboard)/invoices/new/",
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
