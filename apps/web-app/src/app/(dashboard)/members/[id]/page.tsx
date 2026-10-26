"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { useMemberData } from "./_lib/use-member-data"
import { MemberNotice } from "./_components/member-notice"
import { MemberHeaderCard } from "./_components/member-header-card"
import { MemberProfileTabs } from "./_components/member-profile-tabs"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: memberId } = use(params)
  const { t } = useTranslation()
  const router = useRouter()
  const {
    canViewOps,
    canManage,
    canManageMembers,
    currentUserId,
    activeTab,
    setActiveTab,
    tasksPage,
    setTasksPage,
    tasksPageSize,
    member,
    tasks,
    schedule,
    memberAssignments,
    spaceNames,
    fullTasks,
    attendance,
    performance,
    memberProfile,
    memberLoading,
    memberError,
    tasksLoading,
    scheduleLoading,
    refetchMember,
    handleMemberSaved,
  } = useMemberData(memberId)

  if (memberLoading) {
    return (
      <div className="min-h-full bg-background">
        <div className={PAGE_SHELL}>
          <Skeleton className="h-5 w-32 mb-6" />
          <div className="space-y-4 rounded-[22px] border border-border bg-card p-6 shadow-shell">
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
        <Button variant="outline" size="pill" className="mt-3" onClick={() => refetchMember()}>
          {t("common.retry")}
        </Button>
      </MemberNotice>
    )
  }

  if (!member) {
    return (
      <MemberNotice onBack={() => router.push("/members")}>
        <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("members.detail.notFound")}</h3>
        <p className="text-sm text-muted-foreground">{t("members.detail.notFoundDescription")}</p>
      </MemberNotice>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className={cn(PAGE_SHELL, "space-y-4")}>
        {/* Back button */}
        <Button
          variant="ghost"
          size="pill"
          onClick={() => router.push("/members")}
          className="-ml-3 text-muted-foreground hover:text-foreground"
        >
          <Icon name="backLine" />
          {t("members.detail.backToTeam")}
        </Button>

        {/* ── Header Card ──────────────────────────────────────────────── */}
        <MemberHeaderCard
          member={member}
          spaceNames={spaceNames}
          stats={memberProfile?.stats}
          currentUserId={currentUserId}
          canManageMembers={canManageMembers}
          onSaved={handleMemberSaved}
        />

        {/* ── Tabbed content ───────────────────────────────────────────── */}
        <MemberProfileTabs
          member={member}
          memberId={memberId}
          canManageMembers={canManageMembers}
          canViewOps={canViewOps}
          canManage={canManage}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          tasks={tasks}
          tasksLoading={tasksLoading}
          schedule={schedule}
          scheduleLoading={scheduleLoading}
          fullTasks={fullTasks}
          tasksPage={tasksPage}
          setTasksPage={setTasksPage}
          tasksPageSize={tasksPageSize}
          attendance={attendance}
          memberAssignments={memberAssignments}
          performance={performance}
          onMemberSaved={handleMemberSaved}
        />
      </div>
    </div>
  )
}
