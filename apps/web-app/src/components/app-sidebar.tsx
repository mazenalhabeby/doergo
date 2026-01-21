"use client"

import * as React from "react"
import Link from "next/link"
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Users,
  MapPin,
  Building2,
  Settings,
  HelpCircle,
  History,
  Calendar,
  BarChart3,
  Timer,
  ChevronDown,
  Check,
} from "lucide-react"

import { AnimatedLogo } from "@doergo/shared/components"
import { useAuth } from "@/contexts/auth-context"
import { NavGroup, type NavItem } from "@/components/nav-group"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"

// Navigation groups for CLIENT role
const clientNavGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
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
          { title: "View All Tasks", url: "/tasks" },
          { title: "Create New Task", url: "/tasks/new" },
        ],
      },
    ],
  },
  {
    label: "Billing",
    items: [
      {
        title: "Invoices",
        url: "/invoices",
        icon: FileText,
      },
      {
        title: "Payment History",
        url: "/payments",
        icon: History,
      },
    ],
  },
]

// Navigation groups for DISPATCHER role
const dispatcherNavGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        title: "Tasks",
        url: "/tasks",
        icon: ClipboardList,
        items: [
          { title: "View All Tasks", url: "/tasks" },
          { title: "Create Task", url: "/tasks/new" },
        ],
      },
      {
        title: "Live Map",
        url: "/live-map",
        icon: MapPin,
      },
      {
        title: "Schedule",
        url: "/schedule",
        icon: Calendar,
      },
    ],
  },
  {
    label: "Resources",
    items: [
      {
        title: "Technicians",
        url: "/technicians",
        icon: Users,
        items: [
          { title: "View All Technicians", url: "/technicians" },
          { title: "Add Technician", url: "/technicians/new" },
          { title: "Manage Availability", url: "/technicians/availability" },
        ],
      },
      {
        title: "Organizations",
        url: "/organizations",
        icon: Building2,
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        title: "Performance",
        url: "/reports/performance",
        icon: BarChart3,
      },
      {
        title: "SLA Compliance",
        url: "/reports/sla",
        icon: Timer,
      },
    ],
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
    title: "Help Center",
    url: "/help",
    icon: HelpCircle,
  },
]

// Mock organizations for dispatcher
const organizations = [
  { id: "1", name: "All Organizations", shortName: "All", color: "from-slate-500 to-slate-600" },
  { id: "2", name: "Acme Corporation", shortName: "AC", color: "from-blue-500 to-blue-600" },
  { id: "3", name: "Tech Solutions Inc", shortName: "TS", color: "from-purple-500 to-purple-600" },
  { id: "4", name: "Green Energy Co", shortName: "GE", color: "from-emerald-500 to-emerald-600" },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const [selectedOrg, setSelectedOrg] = React.useState(organizations[0])

  // Get navigation based on user role
  const navGroups = user?.role === "DISPATCHER" ? dispatcherNavGroups : clientNavGroups
  const isDispatcher = user?.role === "DISPATCHER"

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="p-4 pb-2">
        {/* Logo & Brand Section */}
        <div className="flex flex-col items-center text-center mb-4">
          <Link href="/dashboard" className="block transition-transform hover:scale-105">
            <AnimatedLogo size="default" />
          </Link>
          <div className="mt-3 space-y-0.5">
            <p className="text-[15px] font-semibold text-slate-700">
              {isDispatcher ? "Dispatcher Portal" : "Client Portal"}
            </p>
            <p className="text-[13px] text-slate-400">
              Field Service Management
            </p>
          </div>
        </div>

        {/* Organization Switcher - Dispatcher only */}
        {isDispatcher && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group flex w-full items-center gap-2.5 rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/50 p-2.5 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md hover:from-white hover:to-white">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${selectedOrg.color} text-white text-sm font-bold shadow-sm`}>
                  {selectedOrg.shortName}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-slate-800 truncate">
                    {selectedOrg.name}
                  </p>
                  <p className="text-[12px] text-slate-400 font-medium">
                    Switch organization
                  </p>
                </div>
                <ChevronDown className="size-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[--radix-dropdown-menu-trigger-width] p-1.5 rounded-xl shadow-lg border-slate-200/80"
            >
              {organizations.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => setSelectedOrg(org)}
                  className="flex items-center gap-2.5 p-1.5 rounded-lg cursor-pointer"
                >
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${org.color} text-white text-[12px] font-bold`}>
                    {org.shortName}
                  </div>
                  <span className="flex-1 text-[14px] font-medium text-slate-700">
                    {org.name}
                  </span>
                  {selectedOrg.id === org.id && (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600">
                      <Check className="size-2.5 text-white" />
                    </div>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarSeparator className="mx-4 bg-slate-100" />

      <SidebarContent className="px-3 py-2">
        {/* Main Navigation Groups */}
        {navGroups.map((group) => (
          <NavGroup key={group.label} label={group.label} items={group.items} />
        ))}

        {/* Secondary Navigation */}
        <div className="mt-auto pt-2">
          <SidebarSeparator className="mx-2 mb-2 bg-slate-100" />
          <NavSecondary items={navSecondary} />
        </div>
      </SidebarContent>

      <SidebarSeparator className="mx-4 bg-slate-100" />

      <SidebarFooter className="p-3">
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
