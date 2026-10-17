"use client"

import { personName } from "@hbcfield/shared/client"
import { use, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import {
  ArrowLeft,
  Mail,
  Cake,
  MapPin,
  Pencil,
  Clock,
  Timer,
  LayoutGrid,
  ShieldCheck,
  ClipboardList,
  Calendar,
  Umbrella,
  BarChart3,
  Package,
  Receipt,
  MessageSquare,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { StatementTab } from "./_components/statement-tab"

import { useMemberData } from "./_lib/use-member-data"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { roleBadge, ROLE_COLOR_FALLBACK } from "@/lib/role-badge"
import { useTimeFormat } from "@/hooks"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

import dynamic from "next/dynamic"
// Worker tabs — consolidated from the retired /employees page (single member page).
// Imported from the leaf modules, NOT the barrel: `_components/index.ts` also
// re-exports PerformanceTab, so importing through it risks pulling recharts back
// into this chunk and undoing the split above.
import { TasksTab } from "./_components/tasks-tab"
import { AttendanceTab } from "./_components/attendance-tab"
import { LocationsTab } from "./_components/locations-tab"
import { ScheduleTab } from "./_components/schedule-tab"
import { HoldingsTab } from "./_components/holdings-tab"
import {
  type Task,
  type ScheduleEntry,
} from "@/lib/api"
import { getStatusConfig } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRelativeDay, formatDayMonth, dateLocale } from "@/lib/format-date"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { useContactActions } from "@/hooks/use-contact-actions"
import { useMemberProfilePage } from "./use-member-profile-page"
import {
  PerformanceTab,
  AccessBuilder,
  EditMemberDialog,
  AuditTrail,
  TimeOffTab,
  TASKS_PAGE_SIZE,
  DAY_KEYS,
  MemberNotice,
} from "./member-profile-page-helpers"
import { MemberProfilePageDetail } from "./member-profile-page-detail"
import { MemberProfilePageDetail2 } from "./member-profile-page-detail2"
import { MemberProfilePagePart } from "./member-profile-page-part"
import { MemberProfilePagePrevious } from "./member-profile-page-previous"
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
