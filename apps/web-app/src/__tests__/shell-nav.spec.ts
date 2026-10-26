/**
 * The shell's menu (components/app-shell/nav): one list, filtered by one question per page. These pin the
 * rules a person SEES — a group never offers a page the route table refuses, a group of one is that page, and
 * every page the old bar offered is still somewhere in the menu.
 */
import fs from "fs"
import path from "path"
import { MY_ITEMS, NAV_HREFS, NAV_SECTIONS, visibleSections } from "@/components/app-shell/nav/nav-config"
import { isActive, isEntryActive } from "@/components/app-shell/nav/nav-active"

const all = () => true
const only =
  (...hrefs: string[]) =>
  (href: string) =>
    hrefs.includes(href)

describe("visibleSections", () => {
  it("everything allowed → every section, every group with all its pages", () => {
    const s = visibleSections(NAV_SECTIONS, all)
    expect(s.map((x) => x.key)).toEqual(NAV_SECTIONS.map((x) => x.key))
    const time = s.flatMap((x) => x.items).find((i) => i.icon === "time")!
    expect(time.kids!.map((k) => k.href)).toEqual(["/attendance", "/schedule", "/overtime", "/issues"])
  })

  it("a group keeps only the pages allowed, and opens on the first of them", () => {
    const s = visibleSections(NAV_SECTIONS, only("/dashboard", "/schedule", "/issues"))
    const time = s.flatMap((x) => x.items).find((i) => i.icon === "time")!
    expect(time.kids!.map((k) => k.href)).toEqual(["/schedule", "/issues"])
    expect(time.href).toBe("/schedule")
  })

  it("a group left with ONE page is that page — no chevron for a single row", () => {
    const s = visibleSections(NAV_SECTIONS, only("/dashboard", "/team"))
    const people = s.flatMap((x) => x.items).find((i) => i.icon === "people")!
    expect(people.kids).toBeUndefined()
    expect(people.href).toBe("/team")
  })

  it("nothing allowed in a section → the section is gone (no orphan heading)", () => {
    const s = visibleSections(NAV_SECTIONS, only("/dashboard"))
    expect(s.map((x) => x.key)).toEqual(["main"])
    expect(s[0].items.map((i) => i.href)).toEqual(["/dashboard"])
  })

  it("never offers a page the question refused", () => {
    const refused = new Set(["/invoices", "/documents/types", "/members"])
    const s = visibleSections(NAV_SECTIONS, (h) => !refused.has(h))
    const hrefs = s.flatMap((x) => x.items.flatMap((i) => [i.href, ...(i.kids ?? []).map((k) => k.href)]))
    for (const h of refused) expect(hrefs).not.toContain(h)
  })
})

describe("the menu still reaches every page the old bar did", () => {
  it.each([
    "/dashboard",
    "/tasks",
    "/calendar",
    "/approvals",
    "/attendance",
    "/schedule",
    "/overtime",
    "/issues",
    "/members",
    "/invitations",
    "/team",
    "/locations",
    "/manage",
    "/clients",
    "/assets",
    "/portals",
    "/reports",
    "/invoices",
    "/documents",
    "/documents/all",
    "/documents/types",
    "/documents/templates",
    "/documents/compliance",
    "/my/attendance",
    "/my/time-off",
    "/my/documents",
  ])("%s", (href) => {
    expect(NAV_HREFS).toContain(href)
  })

  it("HR is the /my tabs — one list (MY_ITEMS)", () => {
    const hr = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.icon === "idCard")!
    expect(hr.kids!.map((k) => k.href)).toEqual(MY_ITEMS.map((k) => k.href))
  })

  it("keeps the guided tour's anchors", () => {
    const tours = NAV_SECTIONS.flatMap((s) => s.items.flatMap((i) => [i.tour, ...(i.kids ?? []).map((k) => k.tour)]))
    for (const a of [
      "nav-dashboard",
      "nav-tasks",
      "nav-team",
      "nav-spaces",
      "nav-reports",
      "nav-time-attendance",
      "nav-my-attendance",
      "nav-my-timeoff",
    ]) {
      expect(tours).toContain(a)
    }
  })
})

describe("the active row", () => {
  it("the most specific page wins", () => {
    expect(isActive("/settings/billing", "/settings")).toBe(false)
    expect(isActive("/documents/types", "/documents")).toBe(false)
    expect(isActive("/documents/types", "/documents/types")).toBe(true)
    expect(isActive("/tasks/123", "/tasks")).toBe(true)
  })

  it("Dashboard is active on itself only", () => {
    expect(isActive("/dashboard/anything", "/dashboard")).toBe(false)
  })

  it("a group is active when one of its pages is", () => {
    const time = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.icon === "time")!
    expect(isEntryActive("/overtime", time)).toBe(true)
    expect(isEntryActive("/tasks", time)).toBe(false)
  })
})

describe("performance and safety of the shell", () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8")
  it("menu links do not prefetch on load (≤ 8 requests in the first second) — a hover does", () => {
    const nav = read("components/app-shell/sidebar/sidebar-nav.tsx")
    const links = nav.match(/<Link\b/g)!.length
    expect(nav.match(/prefetch=\{false\}/g)!.length).toBe(links)
    expect(nav).toMatch(/onMouseEnter=\{\(\) => warm\(/)
  })

  it("the workspace list is read only when its menu opens", () => {
    expect(read("components/app-shell/sidebar/sidebar-header.tsx")).toMatch(
      /useActiveSpaces\(\{ enabled: open && mayOpenSpaces \}\)/,
    )
  })

  it("the menu is filtered by the route table and the Options, nowhere else", () => {
    const hook = read("components/app-shell/nav/use-shell-nav.ts")
    expect(hook).toContain("offers(href)")
    expect(hook).toContain("NAV_OPTION[href]")
  })

  it("no HTML is injected anywhere in the shell", () => {
    for (const f of ["sidebar/sidebar.tsx", "sidebar/sidebar-nav.tsx", "sidebar/sidebar-header.tsx", "top-bar.tsx"]) {
      expect(read(`components/app-shell/${f}`)).not.toContain("dangerouslySetInnerHTML")
    }
  })
})
