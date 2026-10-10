"use client"

import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMyDocumentRequirements } from "@/hooks/use-document-requirements"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { isActive, isDropdownActive } from "./nav-active"
import { navItemBase, navItemInactive, navItemActiveStyle, bottomIndicator } from "./nav-styles"

// ---------------------------------------------------------------------------
// Documents Dropdown (personal file + the admin surfaces)
// ---------------------------------------------------------------------------
/**
 * Everything document-shaped, in one place.
 *
 * Templates and Credentials had no navigation at all — reachable only from a
 * link inside the Issue page, which meant finding them required knowing they
 * existed. Four related routes across two audiences is exactly what a dropdown
 * is for.
 *
 * With only one item visible — an ordinary member, who sees just their own file
 * — it renders as a plain link instead. A menu that opens to reveal a single
 * entry is one more click for nothing.
 */
export function DocumentsDropdown({
  pathname,
  showIssue,
  showAllDocuments,
  showReview,
  showTypes,
  showTemplates,
  showCompliance,
}: {
  pathname: string
  showIssue: boolean
  showAllDocuments: boolean
  showReview: boolean
  showTypes: boolean
  showTemplates: boolean
  showCompliance: boolean
}) {
  const { t } = useTranslation()
  /*
    The permanently-visible half of the reminder.

    A dot on the way in, not a banner on every page: it costs no layout, needs
    no dismissing, and is still legible in three weeks, by which time a banner
    on every screen has become furniture people read straight past.
  */
  // actionCount, not count: a certificate expiring in three weeks is not
  // something anybody is late for, and a badge that lights up for it teaches
  // people to ignore the badge.
  const { actionCount: outstanding, blocksWork } = useMyDocumentRequirements()

  /*
    EXACTLY the routes this menu contains. The attendance menu listed a route it
    did not contain and omitted two it did, so the bar lit up twice on one page
    and nowhere on two others — the same mistake is easy to make here, where
    three of the four share a prefix.
  */
  const items = [
    /*
      "My documents" moved to the Me menu, where the member's own things live.
      What remains here is the admin side of documents — issuing, reviewing,
      types — so the menu now means one thing rather than two.
    */
    { href: "/documents", label: t("nav.issueDocuments"), show: showIssue },
    /*
      The register of what went out. Beside "Issue" because it answers the
      question issuing raises — did it arrive, was it opened, is it signed —
      and gated on seeing member documents, not on issuing them: chasing a
      signature is a different job from sending one.
    */
    { href: "/documents/all", label: t("nav.allDocuments"), show: showAllDocuments },
    { href: "/documents/review", label: t("documents.review.title"), show: showReview },
    { href: "/documents/types", label: t("documents.types.title"), show: showTypes },
    { href: "/documents/templates", label: t("documents.templates.title"), show: showTemplates },
    { href: "/documents/compliance", label: t("documents.compliance.title"), show: showCompliance },
  ].filter((i) => i.show)

  const active = isDropdownActive(pathname, items.map((i) => i.href))

  // One entry is a link, not a menu.
  if (items.length === 1) {
    const only = items[0]!
    return (
      <Link
        href={only.href}
        data-nav-item
        data-nav-href={only.href}
        data-nav-label={only.label}
        data-nav-active={isActive(pathname, only.href)}
        data-tour="nav-my-documents"
        className={cn(navItemBase, active ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive)}
      >
        {only.label}
        {outstanding > 0 && <NavCountDot count={outstanding} urgent={blocksWork} />}
      </Link>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-nav-item
        data-nav-href="/my/documents"
        data-nav-label={t("nav.documents")}
        data-nav-active={active}
        data-tour="nav-documents"
        className={cn(
          navItemBase,
          "cursor-pointer select-none outline-none",
          active ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
        )}
      >
        {t("nav.documents")}
        {outstanding > 0 && <NavCountDot count={outstanding} urgent={blocksWork} />}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-[200px] rounded-lg p-1">
        {items.map((item, i) => (
          <div key={item.href}>
            {/* The member's own file first, then a rule: below it is everything
                about OTHER people, which is a different kind of screen. */}
            {i === 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem asChild className="rounded-md cursor-pointer">
              <Link href={item.href} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                {item.label}
                {item.href === "/my/documents" && outstanding > 0 && (
                  <NavCountDot count={outstanding} urgent={blocksWork} />
                )}
              </Link>
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A count on a navigation item.
 *
 * Small enough to sit inside a nav row without changing its height, which is
 * the whole point — the signal is permanent, so it must cost nothing. Tabular
 * figures so a 1 and a 2 are the same width and the bar does not twitch when
 * somebody supplies one of two documents.
 */
function NavCountDot({ count, urgent }: { count: number; urgent: boolean }) {
  return (
    <span
      className={cn(
        "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1",
        "text-[10px] font-semibold tabular-nums text-white",
        urgent ? "bg-red-600" : "bg-amber-500",
      )}
    >
      {count}
    </span>
  )
}
