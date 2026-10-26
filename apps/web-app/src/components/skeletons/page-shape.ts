/**
 * Which SHAPE a page draws while it loads — one map for every dashboard page (loading-skeletons board,
 * 2026-10-26). Six shapes cover the product; a new page picks one here, or gets the list, which nearly every
 * page is.
 *
 * Pure (no React) so the spec can walk every route against it.
 */
export type PageShape = "list" | "detail" | "dashboard" | "form" | "calendar" | "messages"

const FORM = [/^\/settings(\/billing)?$/, /^\/invoices\/new$/, /^\/invoices\/[^/]+\/edit$/, /^\/members\/new$/]
const CALENDAR = [/^\/calendar$/, /^\/schedule$/]
// One record: `/x/<id>` and what hangs under it — never the named pages that sit beside the ids.
const DETAIL = [
  /^\/tasks\/(?!recurring$)[^/]+(\/report)?$/,
  /^\/members\/(?!(new|leave-opening|phone-sync)$)[^/]+$/,
  /^\/(clients|customers|assets|invoices|shared)\/[^/]+$/,
  /^\/locations\/[^/]+(\/portals\/[^/]+)?$/,
  /^\/my\/documents\/[^/]+\/sign$/,
]

export function pageShape(pathname: string): PageShape {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  if (path === "/dashboard") return "dashboard"
  if (path === "/messages") return "messages"
  if (FORM.some((r) => r.test(path))) return "form"
  if (CALENDAR.some((r) => r.test(path))) return "calendar"
  if (DETAIL.some((r) => r.test(path))) return "detail"
  return "list"
}
