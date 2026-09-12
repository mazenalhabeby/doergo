import fs from "fs"
import path from "path"

import { code, strip } from "./_screen"

/*
  INVOICES BELONG TO A WORKSPACE THE WAY CLIENTS AND ASSETS DO.

  ⚠️ They were a TAB inside one workspace's settings: Spaces → a workspace →
  Configure → Invoices, and the same four steps again for the next one. Clients,
  assets and portals made this move already — they are what a workspace HAS, not
  how it is configured, and that page is configuration. Invoices were left
  behind with the note that "per-space billing IS a setting", which is true of
  the MODULE and was never true of the invoices.

  ⚠️ And the tab carried its own list: a second, poorer invoice table with its
  own status colours, its own money formatter and no ageing at all. Two lists of
  one thing is the failure this whole area keeps producing.
*/

const DASHBOARD = path.join(__dirname, "../..")
const read = (rel: string) => strip(fs.readFileSync(path.join(DASHBOARD, rel), "utf8"))

describe("the workspace's invoices", () => {
  it("are reached at their own address, like clients and assets", () => {
    const settings = read("locations/[id]/page.tsx")
    expect(settings).toMatch(/invoices:\s*["']\/invoices["']/)
    // The tab itself is gone, not merely hidden.
    expect(settings).not.toContain("InvoicesTab")
    expect(settings).not.toMatch(/value:\s*"invoices"/)
  })

  it("still answer an old link that named the tab", () => {
    /*
      Silently dropping somebody on the General tab would look like the feature
      had been deleted. The redirect carries the workspace across.
    */
    const settings = read("locations/[id]/page.tsx")
    expect(settings).toMatch(/MOVED_TABS\[searchParams\.get\("tab"\)/)
    expect(settings).toMatch(/router\.replace\(`\$\{moved\}\?space=\$\{spaceId\}/)
  })

  it("are linked from the workspace that owns them", () => {
    const general = read("locations/[id]/_components/general-tab.tsx")
    expect(general).toMatch(/href:\s*"\/invoices"/)
    /*
      ⚠️ Invoicing is an organization OPTION, not a per-space module, so it is
      not in the space's module list — and what decides whether a workspace can
      be billed is what it IS. You invoice a customer site, never your own
      warehouse.
    */
    expect(general).toMatch(/space\.kind === "CUSTOMER" && hasPlanFeature\("invoicing"\)/)
  })

  it("offer only workspaces that can be billed", () => {
    const list = code("page.tsx")
    expect(list).toMatch(/useSpaceScope\(\{ kind: "CUSTOMER" \}\)/)
    expect(list).toContain("SpaceTabs")
  })

  it("actually narrow to the chosen workspace", () => {
    /*
      A tab row that changes nothing but the underline is worse than no tab row:
      it says the list is filtered when it is not.
    */
    const list = code("page.tsx")
    expect(list).toMatch(/spaceId:\s*scope\.spaceId \?\? undefined/)
    // And the choice is part of the cache key, or the list shows stale rows.
    expect(list).toMatch(/queryKey:\s*\["invoices",[^\]]*scope\.spaceId\]/)
  })

  it("carry the workspace into the new invoice", () => {
    // Being asked which workspace twice is the same question twice, and the
    // second answer is the one that counts.
    expect(code("page.tsx")).toMatch(/\/invoices\/new\?spaceId=\$\{scope\.spaceId\}/)
  })

  it("are listed by ONE component", () => {
    /*
      ⚠️ The tab's own table is deleted, not left orphaned. It had its own
      STATUS_STYLES — which is how a status colour drifts — and it would have
      gone on showing DRAFT/SENT with no ISSUED at all.
    */
    const orphan = path.join(DASHBOARD, "locations/[id]/_components/invoices-tab.tsx")
    expect(fs.existsSync(orphan)).toBe(false)
  })

  it("says which workspace even when there is only one", () => {
    // The tab row hides itself when there is nothing to choose between, so the
    // subtitle has to carry the answer.
    expect(code("page.tsx")).toContain("invoices.inWorkspace")
  })
})
