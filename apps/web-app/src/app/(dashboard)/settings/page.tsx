"use client"

import { useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { HolidaysSection } from "./_components/holidays-section"
import { useRouteAccess } from "@/hooks/use-route-access"
import { resolveSettingsSection } from "@/lib/route-access"
import { CompaniesSection } from "./_components/companies-section"
import { GeneralSection } from "./_components/general-section"
import { MembersSection } from "./_components/members-section"
import { NotificationsSection } from "./_components/notifications-section"
import { MyEmailNotificationsSection } from "./_components/my-emails-section"
import { ProfileSection } from "./_components/profile-section"
import { SecuritySection } from "./_components/security-section"
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
  const personalNavItems = PERSONAL_NAV_ITEMS.filter((i) => allowed.includes(i.key))
  const showOrgGroup = orgNavItems.length > 0

  // The first section this member may open; a ?section they may not open falls back to it.
  const initialSection = (routeAccess.ctx
    ? resolveSettingsSection(searchParams.get("section"), routeAccess.ctx)
    : "profile") as SettingsSection
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

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 data-tour="page-settings" className="text-2xl font-bold text-foreground tracking-tight">
            {isPersonalSection ? t("settings.personalTitle") : t("settings.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isPersonalSection ? t("settings.personalSubtitle") : t("settings.subtitle")}
          </p>
        </div>

        {/* Sidebar + Content */}
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <nav className="w-56 shrink-0 hidden lg:block">
            <div className="sticky top-24 space-y-0.5">
              {/* Organization section — only for admins */}
              {showOrgGroup && (
                <>
                  <p data-tour="settings-org-group" className="px-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("settings.nav.organizationGroup")}
                  </p>
                  {orgNavItems.map(item => {
                    const isActive = activeSection === item.key
                    return (
                      <button
                        key={item.key}
                        data-tour={`settings-nav-${item.key}`}
                        onClick={() => selectSection(item.key)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                          isActive
                            ? "bg-foreground/[0.06] text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        <item.icon className="size-4" />
                        {t(item.labelKey)}
                      </button>
                    )
                  })}
                </>
              )}

              {/* Personal section */}
              <div data-tour="settings-personal-group" className={showOrgGroup ? "pt-5 pb-1.5" : "pb-1.5"}>
                <p className="px-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("settings.nav.personalGroup")}
                </p>
              </div>
              {personalNavItems.map(item => {
                const isActive = activeSection === item.key
                return (
                  <button
                    key={item.key}
                    data-tour={`settings-nav-${item.key}`}
                    onClick={() => selectSection(item.key)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-foreground/[0.06] text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <item.icon className="size-4" />
                    {t(item.labelKey)}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Mobile Tab Bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border px-4 py-2 flex gap-1 overflow-x-auto">
            {[...orgNavItems, ...personalNavItems].map(item => {
              const isActive = activeSection === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => selectSection(item.key)}
                  className={`flex-none flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {/* Organization sections — inline */}
            {!allowed.includes(activeSection) ? null : <>
            {activeSection === "general" && <div data-tour="settings-general"><GeneralSection /></div>}
            {activeSection === "members" && <div data-tour="settings-members"><MembersSection /></div>}
            {activeSection === "notifications" && <div data-tour="settings-notifications"><NotificationsSection /></div>}
            {/* Organization sections — lazy loaded from sub-pages */}
            {activeSection === "holidays" && <div data-tour="settings-holidays"><HolidaysSection /></div>}
            {activeSection === "companies" && isAdmin && <div data-tour="settings-companies"><CompaniesSection /></div>}
            {activeSection === "audit-log" && <div data-tour="settings-audit"><LazyAuditLog /></div>}
            {/* Personal sections */}
            {activeSection === "profile" && <div data-tour="settings-profile"><ProfileSection /></div>}
            {activeSection === "security" && <div data-tour="settings-security"><SecuritySection /></div>}
            {activeSection === "my-emails" && <div data-tour="settings-my-emails"><MyEmailNotificationsSection /></div>}
            </>}
          </div>
        </div>
      </div>
    </div>
  )
}
