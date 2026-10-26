"use client"

import { useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { Icon } from "@/components/ui/icon"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { GroupLabel, PageHeader, Panel, RAIL_ROW } from "@/components/page/page-kit"
import { cn } from "@/lib/utils"
import { useRouteAccess } from "@/hooks/use-route-access"
import { resolveSettingsSection } from "@/lib/route-access"
// Each section loads when it is opened (see lazy-sections.tsx).
import {
  ClockInSection,
  CompaniesSection,
  GeneralSection,
  HolidaysSection,
  MembersSection,
  MyEmailNotificationsSection,
  NotificationsSection,
  ProfileSection,
  SecuritySection,
} from "./_components/lazy-sections"
import { useClockInPickOffered } from "./_components/use-clock-in-pick-offered"
import { LazyAuditLog } from "./_components/lazy-audit-log"
import { ORG_NAV_ITEMS, PERSONAL_NAV_ITEMS, type SettingsSection } from "./_lib/settings-nav"

// ============================================================================
// Main Settings Page — Sidebar + Content Layout
// ============================================================================

export default function SettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const routeAccess = useRouteAccess()

  const isAdmin = user?.role === "ADMIN"

  /*
    Settings sections owned by an Option, from the table in shared that also
    drives the navigation and the workspace tabs.

    This kept its own copy of the map — correct, and one of three places that had
    to be found and edited together whenever an Option gained a surface. Content
    is still PlanGate-guarded and the API still enforces it.
  */
  /*
    Which sections, asked of the route table (lib/route-access) — the same one
    the dashboard layout and the navbar read. Each section mirrors the endpoint
    it loads (General and Notifications read the ADMIN-only organization
    profile; Members the join code, canManageUsers; Holidays the org-wide
    canManageWorkspaces). The table's Option column is SETTINGS_OPTION[i.key],
    so an unbought Option still takes its section away. Content stays
    PlanGate-guarded and the API still enforces it.

    The small-screen tab bar listed EVERY section to everybody, and a manager
    landed on General, whose first request is refused for anyone but an admin.
  */
  const allowed = routeAccess.settingsSections
  const orgNavItems = ORG_NAV_ITEMS.filter((i) => allowed.includes(i.key))
  // "Clock in" only for somebody with more than one workspace to clock in at.
  const clockInOffered = useClockInPickOffered(allowed.includes("clock-in"))
  const personalNavItems = PERSONAL_NAV_ITEMS.filter(
    (i) => allowed.includes(i.key) && (i.key !== "clock-in" || clockInOffered),
  )
  const showOrgGroup = orgNavItems.length > 0

  // The first section this member may open; a ?section they may not open falls back to it.
  const initialSection = (
    routeAccess.ctx ? resolveSettingsSection(searchParams.get("section"), routeAccess.ctx) : "profile"
  ) as SettingsSection
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection)
  const router = useRouter()

  // Header reflects which group you're in (org vs personal).
  const isPersonalSection = PERSONAL_NAV_ITEMS.some((i) => i.key === activeSection)

  // Switch section AND reflect it in the URL so a refresh stays put.
  const selectSection = useCallback(
    (key: SettingsSection) => {
      setActiveSection(key)
      router.replace(`/settings?section=${key}`, { scroll: false })
    },
    [router],
  )

  // One rail entry — the board's rail row, the chosen one filled.
  const railButton = (item: (typeof ORG_NAV_ITEMS)[number]) => (
    <button
      key={item.key}
      type="button"
      data-tour={`settings-nav-${item.key}`}
      aria-current={activeSection === item.key ? "true" : undefined}
      onClick={() => selectSection(item.key)}
      className={cn(RAIL_ROW, "w-auto shrink-0 lg:w-full")}
    >
      <Icon name={item.icon} size={18} className="text-muted-foreground" />
      <span className="whitespace-nowrap">{t(item.labelKey)}</span>
    </button>
  )

  return (
    <div className="min-h-full bg-background">
      <div className={PAGE_SHELL}>
        <PageHeader
          tour="page-settings"
          title={isPersonalSection ? t("settings.personalTitle") : t("settings.title")}
          subtitle={isPersonalSection ? t("settings.personalSubtitle") : t("settings.subtitle")}
        />

        {/* Rail + Content */}
        <div className="grid items-start gap-[18px] lg:grid-cols-[250px_minmax(0,1fr)]">
          {/* The rail — a column on desktop, one scrollable row on small screens. */}
          <Panel
            as="nav"
            className={cn(
              "flex gap-0.5 overflow-x-auto p-2 lg:sticky lg:top-3 lg:flex-col lg:overflow-visible",
              "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            )}
          >
            {/* Organization section — only for whoever may open one of its parts */}
            {showOrgGroup && (
              <>
                <GroupLabel className="hidden lg:flex">
                  <span data-tour="settings-org-group">{t("settings.nav.organizationGroup")}</span>
                </GroupLabel>
                {orgNavItems.map(railButton)}
              </>
            )}

            {/* Personal section */}
            <GroupLabel className={cn("hidden lg:flex", showOrgGroup && "lg:pt-4")}>
              <span data-tour="settings-personal-group">{t("settings.nav.personalGroup")}</span>
            </GroupLabel>
            {personalNavItems.map(railButton)}
          </Panel>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {/* Organization sections — inline */}
            {!allowed.includes(activeSection) ? null : (
              <>
                {activeSection === "general" && (
                  <div data-tour="settings-general">
                    <GeneralSection />
                  </div>
                )}
                {activeSection === "members" && (
                  <div data-tour="settings-members">
                    <MembersSection />
                  </div>
                )}
                {activeSection === "notifications" && (
                  <div data-tour="settings-notifications">
                    <NotificationsSection />
                  </div>
                )}
                {/* Organization sections — lazy loaded from sub-pages */}
                {activeSection === "holidays" && (
                  <div data-tour="settings-holidays">
                    <HolidaysSection />
                  </div>
                )}
                {activeSection === "companies" && isAdmin && (
                  <div data-tour="settings-companies">
                    <CompaniesSection />
                  </div>
                )}
                {activeSection === "audit-log" && (
                  <div data-tour="settings-audit">
                    <LazyAuditLog />
                  </div>
                )}
                {/* Personal sections */}
                {activeSection === "profile" && (
                  <div data-tour="settings-profile">
                    <ProfileSection />
                  </div>
                )}
                {activeSection === "security" && (
                  <div data-tour="settings-security">
                    <SecuritySection />
                  </div>
                )}
                {activeSection === "my-emails" && (
                  <div data-tour="settings-my-emails">
                    <MyEmailNotificationsSection />
                  </div>
                )}
                {activeSection === "clock-in" && (
                  <div data-tour="settings-clock-in">
                    <ClockInSection />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
