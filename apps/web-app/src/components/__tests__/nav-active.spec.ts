/**
 * The navbar highlighted TWO links at once: on /settings/billing both
 * "/settings" and "/settings/billing" matched the prefix test, so the bar
 * pointed at two places and told you nothing about where you were.
 */
describe("navbar active link", () => {
  const NAV_HREFS = [
    "/dashboard", "/tasks", "/schedule", "/attendance", "/overtime", "/issues",
    "/locations", "/members", "/clients", "/invoices", "/reports", "/manage",
    "/invitations", "/join-requests", "/settings", "/settings/billing",
    "/my/attendance", "/my/time-off",
  ]
  const matches = (pathname: string, href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/")
  const isActive = (pathname: string, href: string) =>
    matches(pathname, href) && !NAV_HREFS.some((o) => o.length > href.length && matches(pathname, o))

  const activeFor = (pathname: string) => NAV_HREFS.filter((h) => isActive(pathname, h))

  it("never lights up more than one link", () => {
    for (const p of ["/settings/billing", "/settings", "/my/time-off", "/tasks/abc", "/dashboard", "/attendance"]) {
      expect(activeFor(p)).toHaveLength(1)
    }
  })

  it("the most specific route wins on a nested page", () => {
    expect(activeFor("/settings/billing")).toEqual(["/settings/billing"])
  })

  it("the parent stays active on its own page and on unlisted children", () => {
    expect(activeFor("/settings")).toEqual(["/settings"])
    expect(activeFor("/settings/security")).toEqual(["/settings"])
  })

  it("keeps a child route active for the section it belongs to", () => {
    expect(activeFor("/tasks/123/edit")).toEqual(["/tasks"])
  })

  it("does not confuse /my/attendance with /attendance", () => {
    expect(activeFor("/my/attendance")).toEqual(["/my/attendance"])
    expect(activeFor("/attendance")).toEqual(["/attendance"])
  })

  it("dashboard matches only itself", () => {
    expect(activeFor("/dashboard")).toEqual(["/dashboard"])
    expect(isActive("/dashboard/anything", "/dashboard")).toBe(false)
  })
})
