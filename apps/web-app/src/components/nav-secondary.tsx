"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname()

  const isActive = (url: string) => {
    return pathname === url || pathname.startsWith(url + "/")
  }

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5 px-1.5">
          {items.map((item) => {
            const Icon = item.icon
            const active = isActive(item.url)

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  isActive={active}
                  className={cn(
                    "group/nav-item rounded-xl py-2.5 px-2 transition-all duration-200",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Link href={item.url} className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg transition-all duration-200",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "bg-sidebar-accent/60 text-sidebar-foreground/70 group-hover/nav-item:bg-sidebar-accent group-hover/nav-item:text-sidebar-foreground"
                      )}
                    >
                      <Icon className="size-[16px]" />
                    </div>
                    <span className={cn(
                      "text-[14px] tracking-wide",
                      active ? "font-semibold" : "font-medium"
                    )}>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
