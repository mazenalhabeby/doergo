import fs from "fs"
import path from "path"

/**
 * A workspace's Assets tab shows THAT workspace's proposals; "All workspaces"
 * shows every one the caller may decide.
 *
 * ⚠️ A manager of two depots was shown the other depot's van on this depot's
 * tab — in a kind the tab's picker does not offer, so the one decision on the
 * screen could not be made from it. The server narrows by `proposalInSpace`
 * (shared); what is pinned here is that each screen ASKS for the right queue,
 * and that narrowing the tabs did not leave a page on no screen at all.
 */

const SRC = path.join(process.cwd(), "src")
/** Comments quote the very patterns this looks for. */
const code = (s: string) => s.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:/])\/\/[^\n]*/g, "$1")
const read = (rel: string) => code(fs.readFileSync(path.join(SRC, rel), "utf8"))

describe("the proposal queue asks for the right proposals", () => {
  it("the API sends the workspace as a query, and nothing without one", () => {
    const api = read("lib/api.ts")
    expect(api).toMatch(/getPendingProposals: async \(spaceId\?: string\)/)
    expect(api).toContain("/assets/proposals/pending?spaceId=${encodeURIComponent(spaceId)}")
  })

  it("the queue passes its workspace through, and caches each queue apart", () => {
    const queue = read("components/assets/proposal-queue.tsx")
    expect(queue).toMatch(/spaceId\?: string/)
    expect(queue).toContain("assetsApi.getPendingProposals(spaceId)")
    // Keyed under the shared prefix, so a decision anywhere invalidates every queue.
    expect(queue).toContain('queryKey: ["asset-proposals-pending", spaceId ?? "all"]')
    expect(queue).toContain('invalidateQueries({ queryKey: ["asset-proposals-pending"] })')
  })

  it("a workspace's tab asks for its own", () => {
    const tab = read("app/(dashboard)/locations/[id]/_components/assets-tab.tsx")
    expect(tab).toMatch(/<ProposalQueue kinds=\{kinds\} spaceId=\{allProposals \? undefined : spaceId\} \/>/)
  })

  it("'All workspaces' — and a lone workspace with no All tab — keep every in-scope proposal", () => {
    const page = read("app/(dashboard)/assets/page.tsx")
    expect(page).toContain("<AllProposals />")
    expect(page).toMatch(/<ProposalQueue kinds=\{kindsQ\.data \?\? \[\]\} \/>/)
    expect(page).toContain("allProposals={!scope.showTabs}")
    // A page.tsx may only export its default.
    expect(page).not.toMatch(/export function AllProposals/)
  })
})
