/**
 * The web app's navigation, as DATA — the one list the sidebar, its collapsed rail and the phone drawer render.
 *
 * Before the 2026-10 redesign the same entries were written out four times (the desktop bar, the mobile menu
 * and a dropdown per group), each with its own `show…` flag, and they drifted. Now an entry is a row here;
 * WHO sees it is never decided here — `visibleSections` asks one function per href (the route table's
 * `navOffers` plus the Option that owns the page, see `use-shell-nav.ts`), so the menu can only offer a page
 * the layout will open.
 *
 * Labels are i18n KEYS with an English fallback; the keys are the ones the old bar used, so every language
 * keeps its words.
 */

import type { IconName } from "@hbcfield/shared/client"

/** One page. */
export interface NavLeaf {
  href: string
  label: string
  fallback: string
  /** The guided tour's anchor (components/tour) — kept on the same entries as before. */
  tour?: string
}

/** A top-level row: a page, or a group that opens in place. */
export interface NavEntry extends NavLeaf {
  /** A mark from the one icon library (packages/shared/src/icons). */
  icon: IconName
  /** A live count beside the row (see `use-shell-nav.ts`). */
  badge?: "approvals" | "myDocuments"
  kids?: NavLeaf[]
}

export interface NavSection {
  key: string
  /** No label = the first block (Home, Approvals, Tasks, Calendar). */
  label?: { key: string; fallback: string }
  items: NavEntry[]
}

/** The member's own corner — also the tabs of /my (hooks/use-my-sections.ts reads this list). */
export const MY_ITEMS: readonly NavLeaf[] = [
  { href: "/my/attendance", label: "nav.myShifts", fallback: "My shifts", tour: "nav-my-attendance" },
  { href: "/my/time-off", label: "nav.sidebar.timeOff", fallback: "Requests", tour: "nav-my-timeoff" },
  { href: "/my/documents", label: "nav.sidebar.myDocuments", fallback: "My documents", tour: "nav-my-documents" },
]

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    key: "main",
    items: [
      {
        href: "/dashboard",
        label: "nav.sidebar.dashboard",
        fallback: "Dashboard",
        icon: "dashboard",
        tour: "nav-dashboard",
      },
      { href: "/approvals", label: "approvals.title", fallback: "Approvals", icon: "inbox", badge: "approvals" },
      { href: "/tasks", label: "nav.sidebar.tasks", fallback: "Tasks", icon: "tasks", tour: "nav-tasks" },
      { href: "/calendar", label: "nav.sidebar.calendar", fallback: "Calendar", icon: "calendar" },
    ],
  },
  {
    key: "operations",
    label: { key: "nav.sidebar.operationsGroup", fallback: "Operations" },
    items: [
      {
        href: "/attendance",
        label: "nav.timeAttendance",
        fallback: "Shifts & Attendance",
        icon: "time",
        tour: "nav-time-attendance",
        kids: [
          { href: "/attendance", label: "nav.sidebar.attendance", fallback: "Attendance" },
          { href: "/schedule", label: "nav.sidebar.schedule", fallback: "Schedule" },
          { href: "/overtime", label: "nav.sidebar.overtime", fallback: "Overtime" },
          { href: "/issues", label: "nav.sidebar.issues", fallback: "Shift Issues" },
        ],
      },
      {
        href: "/members",
        label: "nav.team",
        fallback: "Team Members",
        icon: "people",
        tour: "nav-team",
        kids: [
          { href: "/members", label: "nav.sidebar.members", fallback: "Members" },
          { href: "/invitations", label: "nav.sidebar.invitations", fallback: "Invitations" },
          { href: "/team", label: "nav.sidebar.colleagues", fallback: "Colleagues" },
        ],
      },
      {
        href: "/my/attendance",
        label: "nav.me",
        fallback: "HR",
        icon: "idCard",
        tour: "nav-me",
        badge: "myDocuments",
        kids: [...MY_ITEMS],
      },
      { href: "/locations", label: "nav.spaces", fallback: "Workspaces", icon: "workspaces", tour: "nav-spaces" },
      { href: "/manage", label: "nav.manage", fallback: "Manage", icon: "manage" },
    ],
  },
  {
    key: "resources",
    label: { key: "nav.sidebar.resourcesGroup", fallback: "Resources" },
    items: [
      { href: "/clients", label: "nav.crm", fallback: "CRM", icon: "clients" },
      { href: "/assets", label: "nav.assets", fallback: "Assets", icon: "assets" },
      { href: "/portals", label: "nav.portals", fallback: "Portals", icon: "portals" },
      {
        href: "/documents",
        label: "nav.documents",
        fallback: "Documents",
        icon: "documents",
        tour: "nav-documents",
        kids: [
          { href: "/documents", label: "nav.issueDocuments", fallback: "Issue documents" },
          { href: "/documents/all", label: "nav.allDocuments", fallback: "All documents" },
          { href: "/documents/types", label: "documents.types.title", fallback: "Document types" },
          { href: "/documents/templates", label: "documents.templates.title", fallback: "Templates" },
          { href: "/documents/compliance", label: "documents.compliance.title", fallback: "Compliance" },
        ],
      },
    ],
  },
  {
    key: "money",
    label: { key: "nav.sidebar.reportsGroup", fallback: "Reports" },
    items: [
      { href: "/reports", label: "nav.reports", fallback: "Reports", icon: "reports", tour: "nav-reports" },
      {
        href: "/invoices",
        label: "nav.sidebar.invoices",
        fallback: "Invoices",
        icon: "invoices",
        tour: "nav-invoices",
      },
    ],
  },
]

/**
 * The sections this member gets: entries whose page `allow`s them, groups trimmed to the pages they may open.
 * A group left with ONE page is that page (no chevron for a single row); with none, it is gone, as is an empty
 * section. Pure — the tests call it with a fake `allow`.
 */
export function visibleSections(sections: readonly NavSection[], allow: (href: string) => boolean): NavSection[] {
  const out: NavSection[] = []
  for (const section of sections) {
    const items: NavEntry[] = []
    for (const item of section.items) {
      if (!item.kids) {
        if (allow(item.href)) items.push(item)
        continue
      }
      const kids = item.kids.filter((k) => allow(k.href))
      if (kids.length === 0) continue
      if (kids.length === 1) {
        items.push({ ...item, href: kids[0].href, kids: undefined })
        continue
      }
      items.push({ ...item, href: kids[0].href, kids })
    }
    if (items.length) out.push({ ...section, items })
  }
  return out
}

/** Every href the menu can render — the active-row rule needs them all (nav-active.ts). */
export const NAV_HREFS: readonly string[] = [
  ...new Set(
    NAV_SECTIONS.flatMap((s) => s.items.flatMap((i) => [i.href, ...(i.kids ?? []).map((k) => k.href)])).concat([
      "/settings",
      "/settings/billing",
      // Redirects to Approvals now; listed so a stale link still lights the Documents group once, not twice.
      "/documents/review",
    ]),
  ),
]
