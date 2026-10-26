"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { mayListOrgMembers } from "@/lib/assignable-members"
import { useMyDocumentRequirements } from "@/hooks/use-document-requirements"
import { useApprovalsCount } from "../use-approvals-count"
import { isActive, isEntryActive } from "../nav/nav-active"
import { usePrefetchRoutes } from "../nav/use-prefetch-routes"
import type { NavLeaf, NavSection } from "../nav/nav-config"
import { Icon } from "@/components/ui/icon"

const EASE = "duration-300 ease-[cubic-bezier(.32,.72,0,1)]"
/** The count beside a row or a page (decisions waiting, documents to hand in). */
const COUNT_PILL = "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
/** Amber; coral when something cannot wait (a person out of the ring now, extra time on a running shift). */
const pillTone = (urgent: boolean) => (urgent ? "bg-shell-crit text-white" : "bg-shell-warn text-shell-on-warn")

/**
 * The menu list — the desktop sidebar, its rail and the phone drawer all render THIS (one list, one look).
 * `rail` = the collapsed 76px column: icons only, names as tooltips, groups go to their first page.
 */
export function SidebarNav({
  sections,
  rail = false,
  onNavigate,
}: {
  sections: NavSection[]
  rail?: boolean
  /** The phone drawer closes itself when a page is chosen. */
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const prefetch = usePrefetchRoutes(!!user && mayListOrgMembers(user))
  const { counts, urgent } = useCounts(sections)

  // The group holding the current page is open; others open and close in place.
  const activeGroup = useMemo(
    () => sections.flatMap((s) => s.items).find((i) => i.kids && isEntryActive(pathname, i))?.href ?? null,
    [sections, pathname],
  )
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(activeGroup ? [activeGroup] : []))
  useEffect(() => {
    if (activeGroup) setOpen((o) => (o.has(activeGroup) ? o : new Set(o).add(activeGroup)))
  }, [activeGroup])
  const toggleGroup = (href: string) =>
    setOpen((o) => {
      const next = new Set(o)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })

  // Links do not prefetch on load (≤ 8 requests in the first second); a hover asks for the page and its data.
  const DATA: Record<string, () => void> = {
    "/dashboard": prefetch.prefetchDashboard,
    "/tasks": prefetch.prefetchTasks,
    "/members": prefetch.prefetchTeam,
    "/locations": prefetch.prefetchSpaces,
    "/attendance": prefetch.prefetchAttendance,
  }
  const warm = (href: string) => {
    router.prefetch(href)
    DATA[href]?.()
  }

  const label = (x: NavLeaf) => t(x.label, x.fallback)

  return (
    <nav aria-label={t("nav.navigation", "Navigation")} className="flex flex-col gap-0.5">
      {sections.map((section, si) => (
        <div key={section.key} className={cn("flex flex-col gap-px", si > 0 && "pt-3")}>
          {section.label && (
            <div className="relative flex h-[26px] items-center pl-3">
              <span
                className={cn(
                  "whitespace-nowrap text-[11.5px] font-semibold uppercase tracking-[0.06em] text-shell-soft transition-opacity",
                  rail && "opacity-0",
                )}
              >
                {t(section.label.key, section.label.fallback)}
              </span>
              {rail && <span aria-hidden className="absolute inset-x-3.5 top-1/2 h-px bg-shell-line" />}
            </div>
          )}
          {section.items.map((item) => {
            const active = isEntryActive(pathname, item)
            const isGroup = !!item.kids && !rail
            const expanded = isGroup && open.has(item.href)
            const count = item.badge ? counts[item.badge] : 0
            const hot = item.badge === "approvals" && urgent
            const row = cn(
              "group/row relative flex h-10 w-full items-center gap-3 rounded-xl pl-[15px] pr-2.5 text-sm",
              "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-shell-accent",
              active
                ? "bg-shell-nav-on font-semibold text-shell-nav-on-ink"
                : "font-medium text-shell-ink hover:bg-shell-hover",
            )
            const inner = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-2.5 left-[3px] top-2.5 w-[3px] origin-center rounded bg-shell-accent transition-transform",
                    EASE,
                    active ? "scale-y-100" : "scale-y-0",
                  )}
                />
                <span className={cn("relative grid shrink-0 place-items-center", !active && "text-shell-soft")}>
                  <Icon name={item.icon} size={20} />
                  {rail && count > 0 && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -right-1 -top-[3px] size-2 rounded-full border-2 border-shell-card",
                        hot ? "bg-shell-crit" : "bg-shell-warn",
                      )}
                    />
                  )}
                </span>
                {!rail && <span className="min-w-0 flex-1 truncate text-left">{label(item)}</span>}
                {!rail && count > 0 && (
                  <span className={cn(COUNT_PILL, pillTone(hot))}>{count > 99 ? "99+" : count}</span>
                )}
                {isGroup && (
                  <Icon
                    name="chevronRight"
                    size={14}
                    className={cn("text-shell-soft transition-transform", EASE, expanded && "rotate-90")}
                  />
                )}
              </>
            )
            return (
              <div key={item.href + item.label}>
                {isGroup ? (
                  <button
                    type="button"
                    className={row}
                    aria-expanded={expanded}
                    data-tour={item.tour}
                    onClick={() => toggleGroup(item.href)}
                  >
                    {inner}
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    prefetch={false}
                    className={row}
                    aria-current={active ? "page" : undefined}
                    aria-label={
                      // The inbox says how many wait ("Approvals, 6 waiting") — the number alone is noise.
                      item.badge === "approvals" && count > 0
                        ? t("approvals.navLabel", { count })
                        : rail
                          ? label(item)
                          : undefined
                    }
                    title={rail ? label(item) : undefined}
                    data-tour={item.tour}
                    onMouseEnter={() => warm(item.href)}
                    onFocus={() => warm(item.href)}
                    onClick={onNavigate}
                  >
                    {inner}
                  </Link>
                )}
                {isGroup && (
                  <Kids
                    kids={item.kids!}
                    open={expanded}
                    pathname={pathname}
                    label={label}
                    warm={warm}
                    onNavigate={onNavigate}
                    myDocs={item.badge === "myDocuments" ? counts.myDocuments : 0}
                  />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/** A group's pages, unfolding in place (a grid-rows transition — no measuring, no layout jump). */
function Kids({
  kids,
  open,
  pathname,
  label,
  warm,
  onNavigate,
  myDocs,
}: {
  kids: NavLeaf[]
  open: boolean
  pathname: string
  label: (x: NavLeaf) => string
  warm: (href: string) => void
  onNavigate?: () => void
  myDocs: number
}) {
  return (
    <div className={cn("grid transition-[grid-template-rows]", EASE, open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="min-h-0 overflow-hidden" inert={!open || undefined}>
        <div className="relative mb-1.5 ml-6 mt-0.5 flex flex-col gap-px pl-3">
          <span aria-hidden className="absolute bottom-1 left-0 top-1 w-[1.5px] rounded bg-shell-line" />
          {kids.map((k) => {
            const on = isActive(pathname, k.href)
            const count = k.href === "/my/documents" ? myDocs : 0
            return (
              <Link
                key={k.href}
                href={k.href}
                prefetch={false}
                aria-current={on ? "page" : undefined}
                data-tour={k.tour}
                onMouseEnter={() => warm(k.href)}
                onFocus={() => warm(k.href)}
                onClick={onNavigate}
                className={cn(
                  "flex h-[34px] items-center gap-2 whitespace-nowrap rounded-[10px] px-2.5 text-[13.5px] outline-none",
                  "transition-colors focus-visible:ring-2 focus-visible:ring-shell-accent",
                  on
                    ? "bg-shell-nav-on font-semibold text-shell-nav-on-ink"
                    : "font-medium text-shell-ink hover:bg-shell-hover",
                )}
              >
                <span className="flex-1 truncate">{label(k)}</span>
                {count > 0 && <span className={cn(COUNT_PILL, pillTone(false))}>{count}</span>}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** The live counts beside rows — reads that already exist (the inbox count, the documents reminder). */
function useCounts(sections: NavSection[]): {
  counts: Record<"approvals" | "myDocuments", number>
  urgent: boolean
} {
  const { allowed, total, urgent } = useApprovalsCount()
  const offersMyDocs = sections.some((s) =>
    s.items.some((i) => i.badge === "myDocuments" && (i.kids ?? [i]).some((k) => k.href === "/my/documents")),
  )
  const { actionCount } = useMyDocumentRequirements({ when: offersMyDocs })
  return { counts: { approvals: allowed ? total : 0, myDocuments: actionCount ?? 0 }, urgent: allowed && urgent }
}
