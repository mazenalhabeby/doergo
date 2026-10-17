"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { useMemberData } from "./_lib/use-member-data"
import { useTimeFormat } from "@/hooks"
import { useContactActions } from "@/hooks/use-contact-actions"

/** MemberProfilePage's state and handlers — everything before its markup, moved here unchanged. */
export function useMemberProfilePage({
  params,
}: Pick<{
  params: Promise<{ id: string }>
}, 'params'>) {
  const { id: memberId } = use(params)
  const { t } = useTranslation()
  const { message, canMessage } = useContactActions()
  const { formatSchedule } = useTimeFormat()
  const router = useRouter()
  const {
    isAdmin, canViewOps, canManage, canManageMembers, currentUserId,
    activeTab, setActiveTab, tasksPage, setTasksPage, attendanceRange,
    member, tasks, schedule, memberAssignments, spaceNames,
    fullTasks, attendance, performance, memberProfile,
    memberLoading, memberError, tasksLoading, scheduleLoading,
    refetchMember, handleMemberSaved,
  } = useMemberData(memberId)
  const [editOpen, setEditOpen] = useState(false)
  /*
    `?edit=1` opens the editor straight away — the invoice's "Set rate" link
    lands here, and a link that then asks for one more click to find the field
    is a link half done. Read once, from the URL, after the member has loaded.
  */
  const memberLoaded = !!member
  useEffect(() => {
    if (!memberLoaded) return
    if (new URLSearchParams(window.location.search).get("edit") === "1") setEditOpen(true)
  }, [memberLoaded])
  // The statement is what a person's hours cost the company — only for those who may see that.
  const { user: viewer } = useAuth()
  const canViewLabourCost = (viewer as { canViewLabourCost?: boolean } | null)?.canViewLabourCost === true

  const hs = memberProfile?.stats
  const headerStats = hs
    ? (() => {
        const byStatus = (hs.tasks?.byStatus || {}) as Record<string, number>
        const active = ["ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "BLOCKED", "NEW"].reduce(
          (n, k) => n + (byStatus[k] || 0),
          0,
        )
        const ratingCount = hs.performance?.ratingCount ?? 0
        const rating = hs.performance?.customerRating
        const hours = hs.attendance?.totalHoursThisWeek
        return [
          { key: "score", label: t("members.stats.score", "Score"), value: ratingCount > 0 && rating != null ? rating.toFixed(1) : "—" },
          { key: "done", label: t("members.stats.done", "Done"), value: String(hs.tasks?.completed ?? 0) },
          { key: "active", label: t("members.stats.active", "Active"), value: String(active) },
          { key: "week", label: t("members.stats.thisWeek", "This Week"), value: hours != null ? `${Math.round(hours)}h` : "0h" },
        ]
      })()
    : null

  return {
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
  }
}

/** What MemberProfilePage and its sections read. */
export type MemberProfilePageState = ReturnType<typeof useMemberProfilePage>
