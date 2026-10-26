"use client"

/**
 * The chrome around the member's own pages, mounted once.
 *
 * Attendance, time off and documents each painted their own heading and their
 * own container, so moving between them threw the whole screen away and rebuilt
 * it — three renders of the same furniture, and a flash between two pages that
 * are meant to feel like one place.
 *
 * As a route-group layout, React keeps this subtree mounted across those
 * navigations: only the panel below swaps. The three routes stay separately
 * code-split, so nobody downloads the documents page to look at their shifts.
 *
 * The tab strip and the "Me" menu read the SAME definition (`useMySections`),
 * which is what stops a member being offered a tab the menu hides, or landing
 * on a page with no tab to come back from.
 */
import { usePathname } from "next/navigation"
import Link from "next/link"

import { useMySections } from "@/hooks/use-my-sections"
import { cn } from "@/lib/utils"
import { PAGE_SHELL } from "@/components/ui/page-width"

export default function MyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const sections = useMySections()

  return (
    <div className={PAGE_SHELL}>
      {/*
        No heading here.

        Each page already carries its own — "My attendance", "Time off", "My
        documents" — and a second title above them would say the section twice.
        The strip IS the heading's context: it says which of your things you are
        looking at, and the menu that brought you here is called Me.
      */}
      {/*
        Hidden when there is one section: a tab strip with a single tab is
        furniture that teaches nothing, and the heading already says where you
        are. Same rule the workspace tabs follow.
      */}
      {sections.length > 1 && (
        <div className="mb-6 border-b border-border">
          <div
            className={
              "flex items-center gap-[26px] overflow-x-auto [-ms-overflow-style:none] " +
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            }
          >
            {sections.map((s) => {
              // startsWith, so a document's own page keeps its tab lit.
              const active = pathname === s.href || pathname.startsWith(`${s.href}/`)
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  data-tour={s.tour}
                  className={cn(
                    "relative -mb-px flex h-11 items-center whitespace-nowrap border-b-2 text-[14.5px] " +
                      "transition-colors duration-150",
                    active
                      ? "border-foreground font-semibold text-foreground"
                      : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {children}
    </div>
  )
}
