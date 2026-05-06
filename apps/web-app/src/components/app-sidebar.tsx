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
  Timer,
  Clock,
  ChevronDown,
  Check,
  UserPlus,
  UserCheck,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

import { AnimatedLogo } from "@hbcfield/shared/components"
import { useAuth, type User } from "@/contexts/auth-context"
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

// Unified navigation groups based on user permissions
function getNavGroups(t: TFunction, user: User | null): { label: string; items: NavItem[] }[] {
  const groups: { label: string; items: NavItem[] }[] = []

  // Main group - always visible
  const mainItems: NavItem[] = [
    {
      title: t("nav.sidebar.dashboard"),
      url: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: t("nav.sidebar.tasks"),
      url: "/tasks",
      icon: ClipboardList,
      items: [
        { title: t("nav.sidebar.viewAllTasks"), url: "/tasks" },
        ...(user?.canCreateTasks ? [{ title: t("nav.sidebar.createNewTask"), url: "/tasks/new" }] : []),
      ],
    },
  ]

  // Add live map for users who can view all tasks
  if (user?.canViewAllTasks) {
    mainItems.push({
      title: t("nav.sidebar.liveMap"),
      url: "/live-map",
      icon: MapPin,
    })
  }

  groups.push({
    label: t("nav.sidebar.mainGroup"),
    items: mainItems,
  })

  // Resources group - permission-gated items
  const resourceItems: NavItem[] = []

  if (user?.canManageUsers) {
    resourceItems.push(
      { title: t("nav.sidebar.members"), url: "/members", icon: Users },
      { title: t("nav.sidebar.invitations"), url: "/invitations", icon: UserPlus },
      { title: t("nav.sidebar.joinRequests"), url: "/join-requests", icon: UserCheck },
      { title: t("nav.sidebar.locations"), url: "/locations", icon: Building2 },
    )
  }

  if (user?.canViewAllTasks) {
    resourceItems.push(
      { title: t("nav.sidebar.schedule"), url: "/technicians/availability", icon: Calendar },
      { title: t("nav.sidebar.attendance"), url: "/attendance", icon: Clock },
      { title: t("nav.sidebar.overtime"), url: "/overtime", icon: Timer },
    )
  }

  if (resourceItems.length > 0) {
    groups.push({
      label: t("nav.sidebar.resourcesGroup"),
      items: resourceItems,
    })
  }

  // Billing group - always visible
  groups.push({
    label: t("nav.sidebar.billingGroup"),
    items: [
      { title: t("nav.sidebar.invoices"), url: "/invoices", icon: FileText },
      { title: t("nav.sidebar.paymentHistory"), url: "/payments", icon: History },
    ],
  })

  return groups
}

// Secondary navigation - permission-gated
function getNavSecondary(t: TFunction, user: User | null) {
  const items = []

  if (user?.canManageUsers) {
    items.push({
      title: t("nav.sidebar.settings"),
      url: "/settings",
      icon: Settings,
    })
  }

  items.push({
    title: t("nav.sidebar.helpCenter"),
    url: "/help",
    icon: HelpCircle,
  })

  return items
}

// Mock organizations for dispatcher
const organizations = [
  { id: "1", name: "All Organizations", shortName: "All", color: "from-slate-500 to-slate-600" },
  { id: "2", name: "Acme Corporation", shortName: "AC", color: "from-blue-500 to-blue-600" },
  { id: "3", name: "Tech Solutions Inc", shortName: "TS", color: "from-purple-500 to-purple-600" },
  { id: "4", name: "Green Energy Co", shortName: "GE", color: "from-emerald-500 to-emerald-600" },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [selectedOrg, setSelectedOrg] = React.useState(organizations[0])

  // Get navigation based on user permissions
  const navGroups = getNavGroups(t, user)
  const navSecondary = getNavSecondary(t, user)
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
            <p className="text-[15px] font-semibold text-foreground">
              {isDispatcher ? t("nav.sidebar.dispatcherPortal") : t("nav.sidebar.adminPortal")}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {t("nav.sidebar.tagline")}
            </p>
          </div>
        </div>

        {/* Organization Switcher - Dispatcher only */}
        {isDispatcher && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-gradient-to-b from-card to-muted/50 p-2.5 text-left shadow-sm transition-all hover:border-border hover:shadow-md hover:bg-accent">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${selectedOrg.color} text-white text-sm font-bold shadow-sm`}>
                  {selectedOrg.shortName}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-foreground truncate">
                    {selectedOrg.name}
                  </p>
                  <p className="text-[12px] text-muted-foreground font-medium">
                    {t("nav.sidebar.switchOrganization")}
                  </p>
                </div>
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[--radix-dropdown-menu-trigger-width] p-1.5 rounded-xl shadow-lg border-border"
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
                  <span className="flex-1 text-[14px] font-medium text-foreground">
                    {org.name}
                  </span>
                  {selectedOrg.id === org.id && (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-600">
                      <Check className="size-2.5 text-white" />
                    </div>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarSeparator className="mx-4 bg-muted" />

      <SidebarContent className="px-3 py-2">
        {/* Main Navigation Groups */}
        {navGroups.map((group) => (
          <NavGroup key={group.label} label={group.label} items={group.items} />
        ))}

        {/* Secondary Navigation */}
        <div className="mt-auto pt-2">
          <SidebarSeparator className="mx-2 mb-2 bg-muted" />
          <NavSecondary items={navSecondary} />
        </div>
      </SidebarContent>

      <SidebarSeparator className="mx-4 bg-muted" />

      <SidebarFooter className="p-3">
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
