// ---------------------------------------------------------------------------
// Nav item active-state helper
// ---------------------------------------------------------------------------
/*
  Every href the bar can render. Needed because a prefix match alone lights up
  TWO items at once: on /settings/billing both "/settings" and
  "/settings/billing" matched, so the bar showed two active links and neither
  told you where you were.

  A nav item is active when it matches AND no LONGER href also matches — the
  most specific route wins, which is what a person reads the highlight to mean.
*/
const NAV_HREFS = [
  "/dashboard", "/tasks", "/calendar", "/schedule", "/attendance", "/overtime", "/issues",
  "/locations", "/members", "/clients", "/assets", "/portals", "/invoices", "/reports", "/manage",
  "/invitations", "/join-requests", "/team", "/settings", "/settings/billing",
  "/my/attendance",
    "/my/time-off",
    "/my/documents",
    "/documents",
    "/documents/review",
    "/documents/types",
    "/documents/templates",
    "/documents/compliance",
] as const

function matches(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

export function isActive(pathname: string, href: string): boolean {
  if (!matches(pathname, href)) return false
  // Beaten by anything more specific that also matches.
  return !NAV_HREFS.some((other) => other.length > href.length && matches(pathname, other))
}

export function isDropdownActive(pathname: string, hrefs: string[]): boolean {
  return hrefs.some((h) => isActive(pathname, h))
}
