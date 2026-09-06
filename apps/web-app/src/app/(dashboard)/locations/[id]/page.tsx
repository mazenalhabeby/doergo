"use client"

import { useState, useEffect } from "react"
import { SPACE_TAB_OPTION } from "@hbcfield/shared/client"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  Blocks,
  Building2,
  CalendarClock,
  ChevronRight as ChevronRightNav,
  FileText,
  Home,
  Loader2,
  Share2,
  ShieldAlert,
  UserCog,
  Workflow,
} from "lucide-react"

import { accessAllows, canManageSpace } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { locationsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlanGate } from "@/components/plan-gate"
import { cn } from "@/lib/utils"

import dynamic from "next/dynamic"

// Every tab is lazy (audit S-C1). This page has ten of them and they reach ~6,400
// lines with their dialogs — the asset-kind editor alone is 670, the rota 733 — and
// the page opens on exactly ONE. Nothing here renders on the server, so ssr:false.
const GeneralTab = dynamic(() => import("./_components/general-tab").then((m) => m.GeneralTab), { ssr: false })
const AttendanceTab = dynamic(() => import("./_components/attendance-tab").then((m) => m.AttendanceTab), { ssr: false })
const ModulesTab = dynamic(() => import("./_components/modules-tab").then((m) => m.ModulesTab), { ssr: false })
const WorkflowTab = dynamic(() => import("./_components/workflow-tab").then((m) => m.WorkflowTab), { ssr: false })
const MembersTab = dynamic(() => import("./_components/members-tab").then((m) => m.MembersTab), { ssr: false })
const InvoicesTab = dynamic(() => import("./_components/invoices-tab").then((m) => m.InvoicesTab), { ssr: false })
const SharingTab = dynamic(() => import("./_components/sharing-tab").then((m) => m.SharingTab), { ssr: false })


/**
 * Tabs that are no longer here, and where their screen lives now.
 *
 * Kept as data rather than three ifs so adding or reversing a move is one line,
 * and so the redirect and the removal cannot disagree about which tabs moved.
 */
const MOVED_TABS: Record<string, string> = {
  customers: "/clients",
  assets: "/assets",
  portal: "/portals",
}

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
    queryKey: ["location", spaceId],
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
  const SECTIONS = [
    { value: "general", label: t("locations.tabs.general"), icon: Building2, show: true },
    { value: "attendance", label: t("scheduling.tabs.attendance"), icon: CalendarClock, show: true },
    { value: "modules", label: t("locations.tabs.modules"), icon: Blocks, show: true },
    /*
      ⚠️ This was `show: true`. The whole builder opened for an organization that
      had not bought Custom workflows — design one, press save, 402. The server
      was doing its job; the experience of not owning the Option was losing work
      at the last step.
    */
    { value: "workflow", label: t("locations.tabs.workflow"), icon: Workflow, show: optionAllows("workflow") },
    { value: "members", label: t("scheduling.tabs.members"), icon: UserCog, show: true },
    { value: "sharing", label: t("spaceSharing.tabTitle"), icon: Share2, show: mods.includes("space_sharing") },
    /*
      Customers, Assets and Client portal used to sit here. They are the
      workspace's CONTENT, not its configuration, and each now has its own
      address where the same component is mounted — see MOVED_TABS above and the
      links on the General tab. Invoices stays: per-space billing IS a setting.
    */
    { value: "invoices", label: t("invoices.title"), icon: FileText, show: space?.kind === "CUSTOMER" && optionAllows("invoices") },
  ].filter((s) => s.show)

  // Gate the whole page on the user-management permission (mirrors other admin pages).
  if (!canManage) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-[1100px] mx-auto px-6 py-6">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-2xl bg-muted/50 p-5 mb-5">
              <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{t("scheduling.unauthorized.title")}</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              {t("scheduling.unauthorized.description")}
            </p>
            <Button variant="outline" className="mt-6" onClick={() => router.push("/locations")}>
              {t("scheduling.backToSpaces")}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.push("/locations")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("scheduling.backToSpaces")}
          </button>
          <div className="mt-3 flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {isLoading ? t("common.loading") : space?.name || t("scheduling.title")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("scheduling.subtitle")}</p>
            </div>
          </div>
        </div>

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
          <Tabs value={activeTab} onValueChange={openTab} className="lg:flex lg:items-start lg:gap-7">
            {/* Section nav — sticky framed rail on desktop, scrollable row on mobile. */}
            <div className="mb-5 lg:sticky lg:top-4 lg:mb-0 lg:w-60 lg:shrink-0 lg:self-start">
              <p className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 lg:block">
                {t("locations.settingsNav", "Settings")}
              </p>
              <TabsList
                className={cn(
                  "flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/40 p-1",
                  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                  "lg:flex-col lg:gap-0.5 lg:overflow-visible lg:rounded-2xl lg:border lg:border-border/60 lg:bg-card/80 lg:p-2 lg:shadow-sm lg:backdrop-blur",
                )}
              >
                {SECTIONS.map((s) => (
                  <TabsTrigger
                    key={s.value}
                    value={s.value}
                    className={cn(
                      "group shrink-0 gap-2 whitespace-nowrap",
                      "lg:relative lg:w-full lg:justify-start lg:rounded-xl lg:px-3 lg:py-2.5 lg:text-[13px] lg:font-medium lg:text-muted-foreground lg:transition-all lg:duration-150",
                      "lg:hover:bg-muted/70 lg:hover:text-foreground",
                      "lg:data-[state=active]:bg-primary/10 lg:data-[state=active]:font-semibold lg:data-[state=active]:text-primary lg:data-[state=active]:shadow-none",
                      // Active left-accent bar.
                      "lg:before:absolute lg:before:left-0 lg:before:top-1/2 lg:before:h-5 lg:before:w-[3px] lg:before:-translate-y-1/2 lg:before:rounded-r-full lg:before:bg-primary lg:before:opacity-0 lg:before:transition-opacity lg:data-[state=active]:before:opacity-100",
                    )}
                  >
                    {/* Icon in a soft tile that tints to primary on the active item. */}
                    <span className="hidden h-6 w-6 items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors group-hover:text-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary lg:flex">
                      <s.icon className="h-3.5 w-3.5" />
                    </span>
                    {/* Inline icon on mobile (no tile). */}
                    <s.icon className="h-4 w-4 shrink-0 lg:hidden" />
                    {s.label}
                    {/* Trailing chevron hints the active section. */}
                    <ChevronRightNav className="ml-auto hidden h-3.5 w-3.5 opacity-0 transition-opacity group-data-[state=active]:opacity-60 lg:block" />
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

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
              {space?.kind === "CUSTOMER" && (
                <TabsContent value="invoices" className="mt-0">
                  <PlanGate feature="invoicing">
                    <InvoicesTab spaceId={spaceId} spaceName={space.name} />
                  </PlanGate>
                </TabsContent>
              )}
            </div>
          </Tabs>
        )}
      </div>
    </div>
  )
}
