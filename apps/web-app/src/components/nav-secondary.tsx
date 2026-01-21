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
                      ? "bg-slate-100/80 text-slate-900 shadow-sm"
                      : "text-slate-500 hover:bg-slate-50/80 hover:text-slate-700"
                  )}
                >
                  <Link href={item.url} className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg transition-all duration-200",
                        active
                          ? "bg-slate-200 text-slate-700"
                          : "bg-slate-100/60 text-slate-400 group-hover/nav-item:bg-slate-100 group-hover/nav-item:text-slate-600"
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
