"use client"

import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMySections } from "@/hooks/use-my-sections"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { isDropdownActive } from "./nav-active"
import { navItemBase, navItemInactive, navItemActiveStyle, bottomIndicator } from "./nav-styles"

/**
 * The member's own corner: their shifts, their leave, their documents.
 *
 * These were three separate entries — two standalone links plus "My documents"
 * buried at the top of the admin Documents menu — which is three lines of bar
 * for everybody and still no sense that they are one thing.
 *
 * Called Me, not HR: that word names the FUNCTION, the area for the people who
 * run it, and it cannot also mean the employee's own file without one of the
 * two being wrong later. Contents come from `useMySections`, the same
 * definition the section's own tab strip reads.
 */
export function MeDropdown({ pathname }: { pathname: string }) {
  const { t } = useTranslation()
  const sections = useMySections()
  if (sections.length === 0) return null

  const active = isDropdownActive(pathname, sections.map((s) => s.href))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-tour="nav-me"
        className={cn(
          navItemBase,
          "cursor-pointer select-none outline-none",
          active ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
        )}
      >
        {t("nav.me", "Me")}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-[200px] rounded-lg p-1">
        {sections.map((s) => (
          <DropdownMenuItem key={s.href} asChild className="rounded-md cursor-pointer">
            <Link href={s.href} data-tour={s.tour} className="flex items-center gap-2 px-2 py-1.5 text-sm">
              {s.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
