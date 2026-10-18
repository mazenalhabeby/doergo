"use client"

import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"


// Worker tabs — consolidated from the retired /employees page (single member page).
// Imported from the leaf modules, NOT the barrel: `_components/index.ts` also
// re-exports PerformanceTab, so importing through it risks pulling recharts back
// into this chunk and undoing the split above.
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { useMemberProfilePage } from "./use-member-profile-page"
import { MemberNotice } from "./member-profile-page-helpers"
import { MemberProfilePageView } from "./member-profile-page-view"
import { MemberProfilePageDetail3 } from "./member-profile-page-detail3"
import { MemberProfilePageActive } from "./member-profile-page-active"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const vm = useMemberProfilePage({ params })
  const {
    memberId,
    t,
    message,
    canMessage,
    formatSchedule,
    router,
    canViewOps,
    canManage,
    canManageMembers,
    currentUserId,
    activeTab,
    setActiveTab,
    tasksPage,
    setTasksPage,
    member,
    tasks,
    schedule,
    memberAssignments,
    spaceNames,
    fullTasks,
    attendance,
    performance,
    memberLoading,
    memberError,
    tasksLoading,
    scheduleLoading,
    refetchMember,
    handleMemberSaved,
    editOpen,
    setEditOpen,
    canViewLabourCost,
    headerStats,
  } = vm

  if (memberLoading) {
    return (
      <div className="min-h-full bg-background">
        <div className={PAGE_SHELL}>
          <Skeleton className="h-5 w-32 mb-6" />
          <div className="bg-card rounded-xl border border-border/80 p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Distinguish a genuine load error (network / permission) from a real
  // not-found — an error must not silently render as "member doesn't exist" (D6).
  if (memberError) {
    return (
      <MemberNotice onBack={() => router.push("/members")}>
        <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("common.somethingWentWrong")}</h3>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchMember()}>
          {t("common.retry")}
        </Button>
      </MemberNotice>
    )
  }

  if (!member) {
    return (
      <MemberNotice onBack={() => router.push("/members")}>
        <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("members.detail.notFound")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("members.detail.notFoundDescription")}
        </p>
      </MemberNotice>
    )
  }

  /* Works for a client or partner — see the tab list below for what that hides. */
  const { isExternalMember, roleConfig, scheduleLabel } = MemberProfilePageView({ t, member })

  return (
    <div className="min-h-full bg-background">
      <div className={cn(PAGE_SHELL, "space-y-6")}>
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/members")}
          className="-ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {t("members.detail.backToTeam")}
        </Button>

        {/* ── Header Card ──────────────────────────────────────────────── */}
        <MemberProfilePageActive vm={vm} roleConfig={roleConfig} scheduleLabel={scheduleLabel} />

        {/* ── Tabbed content ───────────────────────────────────────────── */}
        <MemberProfilePageDetail3 vm={vm} isExternalMember={isExternalMember} />
      </div>
    </div>
  )
}
