"use client"

import * as React from "react"
import Link from "next/link"
import {
  LayoutDashboard,
  ClipboardList,
  Plus,
  FileText,
  Users,
  MapPin,
  Building2,
  Settings,
  HelpCircle,
  type LucideIcon,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

// Navigation item type
type NavItem = {
  title: string
  url: string
  icon: LucideIcon
  isActive?: boolean
  items?: {
    title: string
    url: string
  }[]
}

// Navigation items for CLIENT role
const clientNavMain: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Tasks",
    url: "/tasks",
    icon: ClipboardList,
    items: [
      { title: "All Tasks", url: "/tasks" },
      { title: "Create Task", url: "/tasks/new" },
    ],
  },
  {
    title: "Invoices",
    url: "/invoices",
    icon: FileText,
  },
]

// Navigation items for DISPATCHER role
const dispatcherNavMain: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Tasks",
    url: "/tasks",
    icon: ClipboardList,
    items: [
      { title: "All Tasks", url: "/tasks" },
      { title: "Pending Assignment", url: "/tasks?status=NEW" },
      { title: "In Progress", url: "/tasks?status=IN_PROGRESS" },
    ],
  },
  {
    title: "Technicians",
    url: "/technicians",
    icon: Users,
  },
  {
    title: "Live Map",
    url: "/map",
    icon: MapPin,
  },
  {
    title: "Organizations",
    url: "/organizations",
    icon: Building2,
  },
]

// Secondary navigation (same for all roles)
const navSecondary = [
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
  {
    title: "Help & Support",
    url: "/help",
    icon: HelpCircle,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()

  // Get navigation based on user role
  const navMain = user?.role === "DISPATCHER" ? dispatcherNavMain : clientNavMain

  // Get portal subtitle based on role
  const portalName = user?.role === "DISPATCHER" ? "Dispatcher Portal" : "Client Portal"

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
                  D
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    Doer<span className="text-blue-600">go</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {portalName}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
