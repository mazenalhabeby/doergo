"use client"

import { keys } from "@/lib/query-keys"
import { useState, useEffect } from "react"
import { SPACE_TAB_OPTION } from "@hbcfield/shared/client"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Loader2, ShieldAlert } from "lucide-react"
import type { IconName } from "@hbcfield/shared/client"

import { canManageSpace } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { locationsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { BackToSpaces, CenteredNotice } from "@/components/spaces/space-page"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlanGate } from "@/components/common/plan-gate"
import { Icon } from "@/components/ui/icon"
import { PageHeader, Panel } from "@/components/page/page-kit"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { cn } from "@/lib/utils"

import dynamic from "next/dynamic"
import { MOVED_TABS } from "./_components/moved-tabs"

// Every tab is lazy (audit S-C1). This page has ten of them and they reach ~6,400
// lines with their dialogs — the asset-kind editor alone is 670, the rota 733 — and
// the page opens on exactly ONE. Nothing here renders on the server, so ssr:false.
const GeneralTab = dynamic(() => import("./_components/general-tab").then((m) => m.GeneralTab), { ssr: false })
const AttendanceTab = dynamic(() => import("./_components/attendance-tab").then((m) => m.AttendanceTab), { ssr: false })
const ModulesTab = dynamic(() => import("./_components/modules-tab").then((m) => m.ModulesTab), { ssr: false })
const WorkflowTab = dynamic(() => import("./_components/workflow-tab").then((m) => m.WorkflowTab), { ssr: false })
const MembersTab = dynamic(() => import("./_components/members-tab").then((m) => m.MembersTab), { ssr: false })
const SharingTab = dynamic(() => import("./_components/sharing-tab").then((m) => m.SharingTab), { ssr: false })

export default function SpaceSettingsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams()
  const spaceId = params.id as string
  const { user, hasPlanFeature } = useAuth()
  /*
    Org-wide managers OR this space's own manager may open its settings —
    delegation, so a space can be administered without org-wide rights.

    Through accessAllows rather than walking the object by hand. The hand-rolled
    version needed `as any` to reach in, which means a change to the shape of
    resolved access would not fail to compile — it would quietly evaluate to
    false and lock every manager out of their own space, or worse, not.
  */
  // canManageWorkspaces is the capability this page actually needs; canManageUsers
  // is kept because it used to grant it, and every existing manager holds it.
  // Shared with the Configure button on the spaces list, so the control and the
  // page it opens can never disagree about who may use it.
  const canManage = canManageSpace(user, spaceId)

  /*
    The open tab lives in the URL, not only in state.

    It was read from `?tab=` on the way in but never written on the way round,
    so any screen wanting to send somebody back to a particular tab had to hope
    browser history happened to hold the right entry. It did not: a record page
    calling router.back() landed here on General, because the entry it went back
    to had no idea which tab — or which asset type — had been open.

    `replace`, not `push`: switching tabs is not a place somebody wants the Back
    button to walk through one at a time.
  */
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "general")

  /*
    Where the content tabs went.

    Clients, assets and portals moved to their own addresses — they are what a
    workspace HAS, not how it is configured, and this page is settings. The tabs
    are gone, so every link and bookmark that named one is sent to the page that
    now owns that screen, pre-filtered to this workspace. Silently dropping them
    on the General tab would look like the feature had been deleted.
  */
  useEffect(() => {
    const moved = MOVED_TABS[searchParams.get("tab") ?? ""]
    if (!moved) return
    /*
      Carry the sub-view across.

      The assets tab addressed an open KIND as `&type=`, and an old link that
      names one means to land on that kind, not on the list of kinds. Dropping
      it would make every bookmark and Back button one step less useful than it
      was before the move.
    */
    const type = searchParams.get("type")
    router.replace(`${moved}?space=${spaceId}${type ? `&type=${type}` : ""}`)
  }, [searchParams, router, spaceId])

  const openTab = (tab: string) => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", tab)
    // A tab's own sub-view belongs to the tab that opened it.
    if (tab !== "assets") next.delete("type")
    router.replace(`?${next.toString()}`, { scroll: false })
  }

  const { data: space, isLoading } = useQuery({
    queryKey: keys.locations.detail(spaceId),
    queryFn: () => locationsApi.getById(spaceId),
    enabled: !!spaceId && canManage,
  })

  // Settings sections (config-driven). Conditional ones follow the space's
  // enabled modules / kind. Rendered as a vertical rail on desktop, a scrollable
  // row on mobile.
  const mods = space?.enabledModules ?? []
  /*
    Tabs owned by an Option, from the same table the navigation reads — so a tab
    and a nav item can never disagree about whether something was bought.
  */
  const optionAllows = (tab: string) => {
    const option = SPACE_TAB_OPTION[tab]
    return !option || hasPlanFeature(option)
  }
  const ALL_SECTIONS: { value: string; label: string; icon: IconName; show: boolean }[] = [
    { value: "general", label: t("locations.tabs.general"), icon: "settings", show: true },
    { value: "attendance", label: t("scheduling.tabs.attendance"), icon: "attendance", show: true },
    { value: "modules", label: t("locations.tabs.modules"), icon: "dashboard", show: true },
    /*
      ⚠️ This was `show: true`. The whole builder opened for an organization that
      had not bought Custom workflows — design one, press save, 402. The server
      was doing its job; the experience of not owning the Option was losing work
      at the last step.
    */
    { value: "workflow", label: t("locations.tabs.workflow"), icon: "branch", show: optionAllows("workflow") },
    { value: "members", label: t("scheduling.tabs.members"), icon: "people", show: true },
    { value: "sharing", label: t("spaceSharing.tabTitle"), icon: "link", show: mods.includes("space_sharing") },
    /*
      Customers, Assets, Client portal and Invoices used to sit here. They are
      the workspace's CONTENT, not its configuration, and each now has its own
      address where the same screen lives — see MOVED_TABS above and the links
      on the General tab.
    */
  ]
  const SECTIONS = ALL_SECTIONS.filter((s) => s.show)

  // Gate the whole page on the user-management permission (mirrors other admin pages).
  if (!canManage) {
    return (
      <div className="min-h-full bg-background">
        <div className={PAGE_SHELL}>
          <CenteredNotice
            icon={ShieldAlert}
            title={t("scheduling.unauthorized.title")}
            description={t("scheduling.unauthorized.description")}
          >
            <Button variant="outline" className="mt-6" onClick={() => router.push("/locations")}>
              {t("scheduling.backToSpaces")}
            </Button>
          </CenteredNotice>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className={PAGE_SHELL}>
        {/* Header */}
        <div className="mb-3">
          <BackToSpaces />
        </div>
        <PageHeader
          title={isLoading ? t("common.loading") : space?.name || t("scheduling.title")}
          subtitle={t("scheduling.subtitle")}
          actions={
            space && (
              <Button variant="outline" size="pill" onClick={() => router.push(`/tasks?space=${spaceId}`)}>
                <Icon name="tasks" size={16} />
                {t("locations.viewTasks")}
              </Button>
            )
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !space ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <h3 className="text-lg font-semibold text-foreground">{t("scheduling.notFound.title")}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t("scheduling.notFound.description")}</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={openTab} className="lg:flex lg:items-start lg:gap-4">
            {/* Section nav — the board's rail panel on desktop, a scrollable row on mobile. */}
            <Panel as="nav" className="mb-4 lg:sticky lg:top-4 lg:mb-0 lg:w-[250px] lg:shrink-0 lg:self-start">
              <TabsList
                aria-label={t("locations.settingsNav", "Settings")}
                className={cn(
                  "flex h-auto w-full justify-start gap-0.5 overflow-x-auto bg-transparent p-0",
                  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                  "lg:flex-col lg:overflow-visible",
                )}
              >
                {SECTIONS.map((s) => (
                  <TabsTrigger
                    key={s.value}
                    value={s.value}
                    className={cn(
                      "group h-[46px] shrink-0 justify-start gap-3 whitespace-nowrap rounded-xl px-3 text-sm",
                      "font-medium text-foreground shadow-none transition-colors hover:bg-accent lg:w-full",
                      "data-[state=active]:bg-shell-nav-on data-[state=active]:font-semibold",
                      "data-[state=active]:text-shell-nav-on-ink data-[state=active]:shadow-none",
                    )}
                  >
                    <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-shell-chip text-muted-foreground">
                      <Icon name={s.icon} size={16} />
                    </span>
                    <span className="flex-1 text-left">{s.label}</span>
                    <Icon name="chevronRight" size={14} className="hidden text-muted-foreground lg:block" />
                  </TabsTrigger>
                ))}
              </TabsList>
            </Panel>

            {/* Content column */}
            <div className="min-w-0 flex-1">
              <TabsContent value="general" className="mt-0">
                <GeneralTab space={space} />
              </TabsContent>

              {/* Attendance / scheduling is a Professional+ capability. Under-tier
                  orgs see an upgrade panel here; the API enforces the same 402. */}
              <TabsContent value="attendance" className="mt-0">
                <PlanGate feature="shift_scheduling">
                  <AttendanceTab space={space} />
                </PlanGate>
              </TabsContent>

              <TabsContent value="modules" className="mt-0">
                <ModulesTab space={space} />
              </TabsContent>
              <TabsContent value="workflow" className="mt-0">
                {/* The tab is hidden without the Option; this covers the other
                    way in — ?tab=workflow in the URL, or a bookmark. */}
                <PlanGate feature="workflows">
                  <WorkflowTab space={space} />
                </PlanGate>
              </TabsContent>
              <TabsContent value="members" className="mt-0">
                {/* Apartments live in Assets since units became asset records — so this
                    asks about the module that actually exists. */}
                <MembersTab spaceId={spaceId} hasApartments={mods.includes("assets")} />
              </TabsContent>
              <TabsContent value="sharing" className="mt-0">
                <SharingTab spaceId={spaceId} spaceName={space.name} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </div>
  )
}
