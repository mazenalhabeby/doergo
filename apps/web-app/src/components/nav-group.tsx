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
            className="group/nav-item rounded-xl py-2.5 px-2 transition-all duration-200 hover:bg-slate-50/80 data-[active=true]:bg-transparent"
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="flex size-9 items-center justify-center rounded-lg transition-all duration-200 bg-slate-100/80 text-slate-500 group-hover/nav-item:bg-slate-200/80 group-hover/nav-item:text-slate-700">
                <Icon className="size-[18px]" />
              </div>
              <span className="flex-1 text-[14px] tracking-wide font-medium text-slate-500">
                {item.title}
              </span>
            </div>
            <ChevronRight className="size-4 text-slate-400 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="animate-in slide-in-from-top-1 duration-200">
          <SidebarMenuSub className="ml-[26px] border-l-2 border-slate-200/60 pl-3 pr-2 py-1.5 space-y-0.5">
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
                        ? "bg-gradient-to-r from-blue-50 to-blue-50/50 text-blue-700 font-semibold shadow-sm ring-1 ring-blue-100"
                        : "bg-transparent hover:bg-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <Link href={subItem.url} className="flex items-center justify-between w-full">
                      <span className="text-[12px] tracking-wide truncate">{subItem.title}</span>
                      {subItem.badge !== undefined && (
                        <span
                          className={cn(
                            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-bold",
                            subIsActive
                              ? "bg-blue-600 text-white"
                              : "bg-slate-200 text-slate-600"
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
            ? "bg-gradient-to-r from-blue-50 to-blue-50/50 text-blue-700 shadow-sm ring-1 ring-blue-100"
            : "hover:bg-slate-50/80"
        )}
      >
        <Link href={item.url} className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg transition-all duration-200",
              itemIsActive
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100/80 text-slate-500 group-hover/nav-item:bg-slate-200/80 group-hover/nav-item:text-slate-700"
            )}
          >
            <Icon className="size-[18px]" />
          </div>
          <span className={cn(
            "flex-1 text-[14px] tracking-wide",
            itemIsActive
              ? "font-semibold text-slate-900"
              : "font-medium text-slate-500"
          )}>{item.title}</span>
          {item.badge !== undefined && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[12px] font-bold text-white shadow-sm">
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

  // Check if a URL is active (exact match including query params for sub-items)
  const isActive = (url: string, isSubItem: boolean = false) => {
    const basePath = url.split("?")[0]
    const hasQuery = url.includes("?")

    // For sub-items with query params, require exact pathname match and no query in current URL
    if (isSubItem && hasQuery) {
      return false // Query-based sub-items only active when explicitly navigated
    }

    // For sub-items without query, require exact match
    if (isSubItem) {
      return pathname === basePath
    }

    // For parent items, check prefix
    return pathname === basePath || pathname.startsWith(basePath + "/")
  }

  // Check if any sub-item is active
  const hasActiveSubItem = (subItems?: NavSubItem[]) => {
    if (!subItems) return false
    return subItems.some((item) => isActive(item.url, true))
  }

  return (
    <SidebarGroup className="py-0.5">
      <SidebarGroupLabel className="px-3 mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-slate-400/80">
        {label}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-0.5 px-1.5">
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
