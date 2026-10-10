"use client"

import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { isDropdownActive } from "./nav-active"
import { navItemBase, navItemInactive, navItemActiveStyle, bottomIndicator } from "./nav-styles"
import { useTeamLabels } from "./use-team-labels"

export function TeamDropdown({ pathname, items, onOpen }: { pathname: string; items: string[]; onOpen?: () => void }) {
  const { t } = useTranslation()
  const labels = useTeamLabels()
  const active = isDropdownActive(pathname, items)

  return (
    <DropdownMenu onOpenChange={(open) => { if (open && onOpen) onOpen() }}>
      <DropdownMenuTrigger
        data-tour="nav-team"
        className={cn(
          navItemBase,
          "cursor-pointer select-none outline-none",
          active ? cn(navItemActiveStyle, bottomIndicator) : navItemInactive,
        )}
      >
        {t("nav.team")}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-[180px] rounded-lg p-1">
        {items.map((href) => (
          <DropdownMenuItem key={href} asChild className="rounded-md cursor-pointer">
            <Link href={href} className="flex items-center gap-2 px-2 py-1.5 text-sm">
              {labels[href]}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
