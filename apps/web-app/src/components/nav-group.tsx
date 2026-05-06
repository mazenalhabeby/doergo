"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export type NavSubItem = {
  title: string
  url: string
  badge?: number | string
}

export type NavItem = {
  title: string
  url: string
  icon: LucideIcon
  badge?: number | string
  items?: NavSubItem[]
}

export type NavGroupProps = {
  label: string
  items: NavItem[]
}

// Reusable dropdown item component for items with sub-items
function NavDropdownItem({
  item,
  isActive,
  hasActiveSubItem
}: {
  item: NavItem
  isActive: (url: string, isSubItem?: boolean) => boolean
  hasActiveSubItem: boolean
}) {
  const Icon = item.icon
  const itemIsActive = isActive(item.url)
  const shouldBeOpen = itemIsActive || hasActiveSubItem

  return (
    <Collapsible asChild defaultOpen={shouldBeOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={false}
            className="group/nav-item rounded-xl py-2.5 px-2 transition-all duration-200 hover:bg-sidebar-accent data-[active=true]:bg-transparent"
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="flex size-9 items-center justify-center rounded-lg transition-all duration-200 bg-sidebar-accent text-sidebar-foreground group-hover/nav-item:bg-sidebar-accent group-hover/nav-item:text-sidebar-accent-foreground">
                <Icon className="size-[18px]" />
              </div>
              <span className="flex-1 text-[14px] tracking-wide font-medium text-sidebar-foreground">
                {item.title}
              </span>
            </div>
            <ChevronRight className="size-4 text-sidebar-foreground/70 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="animate-in slide-in-from-top-1 duration-200">
          <SidebarMenuSub className="ml-[26px] border-l-2 border-sidebar-border pl-3 pr-2 py-1.5 space-y-0.5">
            {item.items?.map((subItem) => {
              const subIsActive = isActive(subItem.url, true)
              return (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={subIsActive}
                    className={cn(
                      "rounded-lg py-1.5 px-2 transition-all duration-200",
                      subIsActive
                        ? "bg-sidebar-primary/10 text-sidebar-primary font-semibold ring-1 ring-sidebar-primary/20"
                        : "bg-transparent hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                    )}
                  >
                    <Link href={subItem.url} className="flex items-center justify-between w-full">
                      <span className="text-[12px] tracking-wide truncate">{subItem.title}</span>
                      {subItem.badge !== undefined && (
                        <span
                          className={cn(
                            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-bold",
                            subIsActive
                              ? "bg-sidebar-primary text-sidebar-primary-foreground"
                              : "bg-sidebar-accent text-sidebar-foreground"
                          )}
                        >
                          {subItem.badge}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

// Simple nav item without dropdown
function NavSimpleItem({
  item,
  isActive
}: {
  item: NavItem
  isActive: (url: string) => boolean
}) {
  const Icon = item.icon
  const itemIsActive = isActive(item.url)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.title}
        isActive={itemIsActive}
        className={cn(
          "group/nav-item rounded-xl py-2.5 px-2 transition-all duration-200",
          itemIsActive
            ? "bg-sidebar-primary/10 text-sidebar-primary ring-1 ring-sidebar-primary/20"
            : "hover:bg-sidebar-accent"
        )}
      >
        <Link href={item.url} className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg transition-all duration-200",
              itemIsActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-sidebar-primary/20"
                : "bg-sidebar-accent text-sidebar-foreground group-hover/nav-item:bg-sidebar-accent group-hover/nav-item:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-[18px]" />
          </div>
          <span className={cn(
            "flex-1 text-[14px] tracking-wide",
            itemIsActive
              ? "font-semibold text-sidebar-accent-foreground"
              : "font-medium text-sidebar-foreground"
          )}>{item.title}</span>
          {item.badge !== undefined && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-[12px] font-bold text-sidebar-primary-foreground shadow-sm">
              {item.badge}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function NavGroup({ label, items }: NavGroupProps) {
  const pathname = usePathname()

  // Collect all nav item URLs to avoid ambiguous prefix matches
  const allUrls = items.map((item) => item.url.split("?")[0]!)

  // Check if a URL is active (exact match including query params for sub-items)
  const isActive = (url: string, isSubItem: boolean = false) => {
    const basePath = url.split("?")[0]!
    const hasQuery = url.includes("?")

    // For sub-items with query params, require exact pathname match and no query in current URL
    if (isSubItem && hasQuery) {
      return false // Query-based sub-items only active when explicitly navigated
    }

    // For sub-items without query, require exact match
    if (isSubItem) {
      return pathname === basePath
    }

    // For parent items, check prefix — but not if a sibling nav item has a more specific match
    if (pathname === basePath) return true
    if (pathname.startsWith(basePath + "/")) {
      // Check if another sibling item is a more specific match for this pathname
      const hasSiblingMatch = allUrls.some(
        (other) => other !== basePath && other.startsWith(basePath + "/") && pathname.startsWith(other)
      )
      return !hasSiblingMatch
    }
    return false
  }

  // Check if any sub-item is active
  const hasActiveSubItem = (subItems?: NavSubItem[]) => {
    if (!subItems) return false
    return subItems.some((item) => isActive(item.url, true))
  }

  return (
    <SidebarGroup className="py-0.5">
      <SidebarGroupLabel className="px-3 mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-sidebar-foreground/60">
        {label}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-1.5 px-1.5">
        {items.map((item) => (
          item.items?.length ? (
            <NavDropdownItem
              key={item.title}
              item={item}
              isActive={isActive}
              hasActiveSubItem={hasActiveSubItem(item.items)}
            />
          ) : (
            <NavSimpleItem
              key={item.title}
              item={item}
              isActive={isActive}
            />
          )
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
