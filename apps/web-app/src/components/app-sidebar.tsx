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
  Clock,
  ChevronDown,
  Check,
  UserPlus,
  UserCheck,
  Umbrella,
  Timer,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

import { AnimatedLogo } from "@hbcfield/shared/components"
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

// Navigation groups for ADMIN role
function getAdminNavGroups(t: TFunction): { label: string; items: NavItem[] }[] {
  return [
    {
      label: t("nav.sidebar.mainGroup"),
      items: [
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
            { title: t("nav.sidebar.createNewTask"), url: "/tasks/new" },
          ],
        },
      ],
    },
    {
      label: t("nav.sidebar.resourcesGroup"),
      items: [
        {
          title: t("nav.sidebar.technicians"),
          url: "/technicians",
          icon: Users,
        },
        {
          title: t("nav.sidebar.members"),
          url: "/members",
          icon: Users,
        },
        {
          title: t("nav.sidebar.invitations"),
          url: "/invitations",
          icon: UserPlus,
        },
        {
          title: t("nav.sidebar.joinRequests"),
          url: "/join-requests",
          icon: UserCheck,
        },
        {
          title: t("nav.sidebar.locations"),
          url: "/locations",
          icon: Building2,
        },
        {
          title: t("nav.sidebar.schedule"),
          url: "/technicians/availability",
          icon: Calendar,
        },
        {
          title: t("nav.sidebar.attendance"),
          url: "/attendance",
          icon: Clock,
        },
        {
          title: t("nav.sidebar.overtime"),
          url: "/overtime",
          icon: Timer,
        },
      ],
    },
    {
      label: t("nav.sidebar.billingGroup"),
      items: [
        {
          title: t("nav.sidebar.invoices"),
          url: "/invoices",
          icon: FileText,
        },
        {
          title: t("nav.sidebar.paymentHistory"),
          url: "/payments",
          icon: History,
        },
      ],
    },
  ]
}

// Navigation groups for DISPATCHER role
function getDispatcherNavGroups(t: TFunction): { label: string; items: NavItem[] }[] {
  return [
    {
      label: t("nav.sidebar.overviewGroup"),
      items: [
        {
          title: t("nav.sidebar.dashboard"),
          url: "/dashboard",
          icon: LayoutDashboard,
        },
      ],
    },
    {
      label: t("nav.sidebar.operationsGroup"),
      items: [
        {
          title: t("nav.sidebar.tasks"),
          url: "/tasks",
          icon: ClipboardList,
          items: [
            { title: t("nav.sidebar.viewAllTasks"), url: "/tasks" },
            { title: t("nav.sidebar.createTask"), url: "/tasks/new" },
          ],
        },
        {
          title: t("nav.sidebar.liveMap"),
          url: "/live-map",
          icon: MapPin,
        },
        {
          title: t("nav.sidebar.schedule"),
          url: "/technicians/availability",
          icon: Calendar,
        },
      ],
    },
    {
      label: t("nav.sidebar.resourcesGroup"),
      items: [
        {
          title: t("nav.sidebar.technicians"),
          url: "/technicians",
          icon: Users,
          items: [
            { title: t("nav.sidebar.viewAllTechnicians"), url: "/technicians" },
            { title: t("nav.sidebar.addTechnician"), url: "/technicians/new" },
            { title: t("nav.sidebar.manageAvailability"), url: "/technicians/availability" },
          ],
        },
        {
          title: t("nav.sidebar.members"),
          url: "/members",
          icon: Users,
        },
        {
          title: t("nav.sidebar.invitations"),
          url: "/invitations",
          icon: UserPlus,
        },
        {
          title: t("nav.sidebar.joinRequests"),
          url: "/join-requests",
          icon: UserCheck,
        },
        {
          title: t("nav.sidebar.locations"),
          url: "/locations",
          icon: Building2,
        },
        {
          title: t("nav.sidebar.attendance"),
          url: "/attendance",
          icon: Clock,
        },
        {
          title: t("nav.sidebar.overtime"),
          url: "/overtime",
          icon: Timer,
        },
        {
          title: t("nav.sidebar.organizations"),
          url: "/organizations",
          icon: Building2,
        },
      ],
    },
    {
      label: t("nav.sidebar.reportsGroup"),
      items: [
        {
          title: t("nav.sidebar.performance"),
          url: "/reports/performance",
          icon: BarChart3,
        },
        {
          title: t("nav.sidebar.slaCompliance"),
          url: "/reports/sla",
          icon: Timer,
        },
      ],
    },
  ]
}

// Secondary navigation (same for all roles)
function getNavSecondary(t: TFunction) {
  return [
    {
      title: t("nav.sidebar.settings"),
      url: "/settings",
      icon: Settings,
    },
    {
      title: t("nav.sidebar.helpCenter"),
      url: "/help",
      icon: HelpCircle,
    },
  ]
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

  // Get navigation based on user role
  const navGroups = user?.role === "DISPATCHER" ? getDispatcherNavGroups(t) : getAdminNavGroups(t)
  const navSecondary = getNavSecondary(t)
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
              {isDispatcher ? t("nav.sidebar.dispatcherPortal") : t("nav.sidebar.adminPortal")}
            </p>
            <p className="text-[13px] text-slate-400">
              {t("nav.sidebar.tagline")}
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
                    {t("nav.sidebar.switchOrganization")}
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
