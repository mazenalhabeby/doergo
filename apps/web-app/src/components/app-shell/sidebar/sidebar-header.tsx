"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { Icon } from "@/components/ui/icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * OUR logo — the faceted HBC FIELD mark (public/logo_HBCFIELD.svg, the one the login page and the phone show),
 * not a drawing of it. Decorative here: the organization's name beside it is what the row says.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG from /public; next/image adds nothing here
    <img src="/logo_HBCFIELD.svg" alt="" width={26} height={30} className={cn("h-[30px] w-auto shrink-0", className)} />
  )
}

/** Past this many workspaces the menu gets a search box. */
const SEARCH_FROM = 8
const SEARCH_INPUT =
  "h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"

/**
 * The top of the sidebar: the organization, and — for whoever may open the workspaces — a menu that jumps to
 * one. The workspace list is read only when the menu OPENS (it is never what the first paint needs), from the
 * one shared directory request.
 */
export function SidebarHeader({ rail }: { rail: boolean }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { offers } = useRouteAccess()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const mayOpenSpaces = offers("/locations")
  const { data: spaces = [] } = useActiveSpaces({ enabled: open && mayOpenSpaces })
  const orgName = (user as { organizationName?: string | null } | null)?.organizationName || "HBC Field"

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = spaces.filter((s) => !s.isRemote)
    return needle ? list.filter((s) => s.name.toLowerCase().includes(needle)) : list
  }, [spaces, q])

  const face = (
    <>
      <BrandMark />
      {!rail && (
        <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
          <b className="truncate text-[14.5px] font-bold">{orgName}</b>
          <span className="truncate text-xs text-shell-soft">{t("nav.spaces", "Workspaces")}</span>
        </span>
      )}
    </>
  )
  const faceClass = cn(
    "flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] px-2 text-shell-ink",
    rail && "justify-center px-0",
  )

  if (!mayOpenSpaces) return <div className={faceClass}>{face}</div>

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ("")
      }}
    >
      <DropdownMenuTrigger
        className={cn(
          faceClass,
          "outline-none transition-colors hover:bg-shell-hover focus-visible:ring-2 focus-visible:ring-shell-accent",
        )}
        aria-label={`${orgName} — ${t("nav.spaces", "Workspaces")}`}
      >
        {face}
        {!rail && <Icon name="chevronsUpDown" size={15} className="text-shell-soft" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={rail ? "right" : "bottom"}
        sideOffset={8}
        className="w-72 rounded-xl p-1.5"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("nav.spaces", "Workspaces")}
        </DropdownMenuLabel>
        {spaces.length > SEARCH_FROM && (
          <div className="relative px-1 pb-1">
            <Icon
              name="searchLine"
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={t("common.search")}
              aria-label={t("common.search")}
              className={SEARCH_INPUT}
            />
          </div>
        )}
        <div className="max-h-72 overflow-y-auto">
          {shown.map((s) => (
            <DropdownMenuItem key={s.id} asChild className="cursor-pointer rounded-md">
              <Link
                href={`/locations/${s.id}`}
                prefetch={false}
                className="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <Icon name="workspaces" size={16} className="text-muted-foreground" />
                <span className="truncate">{s.name}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer rounded-md">
          <Link href="/locations" prefetch={false} className="px-2 py-1.5 text-sm font-medium">
            {t("nav.spaces", "Workspaces")} →
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
