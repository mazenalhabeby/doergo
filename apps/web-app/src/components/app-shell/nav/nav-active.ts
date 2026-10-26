import { NAV_HREFS, type NavEntry } from "./nav-config"

/*
  A row is active when its href matches AND no LONGER menu href also matches — the most specific route wins.
  A prefix match alone lit up two rows at once: on /settings/billing both "/settings" and "/settings/billing"
  matched, so the menu showed two places and neither said where you were.
*/
function matches(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

export function isActive(pathname: string, href: string): boolean {
  if (!matches(pathname, href)) return false
  return !NAV_HREFS.some((other) => other.length > href.length && matches(pathname, other))
}

/** A group is active when one of its pages is; a page is active by its own href. */
export function isEntryActive(pathname: string, entry: NavEntry): boolean {
  return entry.kids ? entry.kids.some((k) => isActive(pathname, k.href)) : isActive(pathname, entry.href)
}
