"use client"

import { use, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import {
  ArrowLeft,
  Mail,
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
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { useTimeFormat } from "@/hooks"
import { AccessBuilder } from "@/components/access-builder"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { EditMemberDialog } from "../_components/edit-member-dialog"
import { AuditTrail } from "@/components/audit-trail"
import dynamic from "next/dynamic"
// Worker tabs — consolidated from the retired /employees page (single member page).
import {
  TasksTab,
  AttendanceTab,
  LocationsTab,
  ScheduleTab,
  TimeOffTab,
} from "./_components"
// Performance tab pulls in recharts — load it as its own chunk only when the tab
// is opened, so every other visitor doesn't pay for the chart lib (P11).
const PerformanceTab = dynamic(
  () => import("./_components/performance-tab").then((m) => m.PerformanceTab),
  { ssr: false },
)
import {
  organizationsApi,
  employeesApi,
  type Task,
  type ScheduleEntry,
} from "@/lib/api"
import { getStatusConfig } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Tasks tab page size (P3) — bounds the per-member task fetch + render.
const TASKS_PAGE_SIZE = 20

const ROLE_CONFIG: Record<string, { labelKey: string; className: string; gradient: string }> = {
  ADMIN: {
    labelKey: "members.roles.admin",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50",
    gradient: "from-blue-500 to-blue-600",
  },
  DISPATCHER: {
    labelKey: "members.roles.manager",
    className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-200/50 dark:border-purple-800/50",
    gradient: "from-purple-500 to-purple-600",
  },
  TECHNICIAN: {
    labelKey: "members.roles.employee",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/50",
    gradient: "from-emerald-500 to-emerald-600",
  },
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

function formatRelativeDate(dateStr: string, t: TFunction): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return t("common.today")
  if (diffDays === 1) return t("members.detail.yesterday")
  if (diffDays < 7) return t("members.detail.daysAgo", { count: diffDays })
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: memberId } = use(params)
  const { t } = useTranslation()
  const { formatSchedule } = useTimeFormat()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  // Manager+ may see the operational tabs (tasks/attendance/schedule/perf) and
  // manage schedules/attendance — same gate the retired /employees page used.
  const canViewOps = isAdmin || !!user?.canViewAllTasks
  const canManage = isAdmin || !!user?.canViewAllTasks
  const [editOpen, setEditOpen] = useState(false)
  // Controlled so the guided tour can open the Access tab: Radix tabs don't switch
  // on a synthetic .click(), but a plain onClick on the trigger (below) does fire.
  const [activeTab, setActiveTab] = useState("overview")

  // Tasks tab pagination (P3) and attendance window (P4) — bound the per-member
  // history so a long-tenured member doesn't stream thousands of rows per open.
  const [tasksPage, setTasksPage] = useState(1)
  const attendanceRange = useMemo(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 90)
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
  }, [])

  // Fetch this one member by id (single row, same shape as a list row) — no more
  // pulling the whole org and find()-ing it, which broke past 200 members (P1).
  const { data: memberData, isLoading: memberLoading, isError: memberError, refetch: refetchMember } = useQuery({
    queryKey: ["orgMember", memberId],
    queryFn: () => organizationsApi.getMember(memberId),
    enabled: !!memberId,
  })

  // Fetch tasks assigned to this member
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["memberTasks", memberId],
    queryFn: () => employeesApi.getTasks(memberId, { limit: 5 }),
    enabled: !!memberId,
  })

  // Fetch schedule
  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ["employeeSchedule", memberId],
    queryFn: () => employeesApi.getSchedule(memberId),
    enabled: !!memberId,
  })

  // This member's space assignments in ONE call (was an N+1 fan-out over every
  // location just to build the header badges). Feeds both the header spaceNames
  // and the Locations tab (P2).
  const { data: memberAssignments = [] } = useQuery({
    queryKey: ["memberLocationAssignments", memberId],
    queryFn: () => employeesApi.getAssignments(memberId),
    enabled: !!memberId,
    staleTime: 30_000,
  })

  const spaceNames = useMemo(
    () => memberAssignments.map((a: any) => a.location?.name).filter(Boolean),
    [memberAssignments],
  )

  // ── Operational tabs (manager+ only) — each fetches ONLY when its tab is open ──
  const { data: fullTasks } = useQuery({
    queryKey: ["memberTasksFull", memberId, tasksPage],
    queryFn: () => employeesApi.getTasks(memberId, { page: tasksPage, limit: TASKS_PAGE_SIZE }),
    enabled: !!memberId && canViewOps && activeTab === "tasks",
    staleTime: 30_000,
  })
  const { data: attendance } = useQuery({
    queryKey: ["memberAttendance", memberId, attendanceRange.startDate, attendanceRange.endDate],
    queryFn: () => employeesApi.getAttendance(memberId, attendanceRange.startDate, attendanceRange.endDate),
    enabled: !!memberId && canViewOps && activeTab === "attendance",
    staleTime: 30_000,
  })
  const { data: performance } = useQuery({
    queryKey: ["memberPerformance", memberId],
    queryFn: () => employeesApi.getPerformance(memberId),
    enabled: !!memberId && canViewOps && activeTab === "performance",
    staleTime: 30_000,
  })

  const schedule = scheduleData?.schedule || []
  const member = memberData

  if (memberLoading) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-[1440px] mx-auto px-6 py-6">
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
      <div className="min-h-full bg-background">
        <div className="max-w-[1440px] mx-auto px-6 py-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/members")}
            className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            {t("members.detail.backToTeam")}
          </Button>
          <div className="text-center py-20">
            <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("common.somethingWentWrong")}</h3>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchMember()}>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-[1440px] mx-auto px-6 py-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/members")}
            className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            {t("members.detail.backToTeam")}
          </Button>
          <div className="text-center py-20">
            <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("members.detail.notFound")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("members.detail.notFoundDescription")}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const roleConfig = ROLE_CONFIG[member.role] || ROLE_CONFIG.TECHNICIAN!
  const scheduleLabel = member.scheduleType === "FIXED"
    ? t("members.detail.fixedSchedule")
    : member.scheduleType === "FLEXIBLE"
      ? t("members.detail.flexibleHours")
      : null

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/members")}
          className="-ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Team
        </Button>

        {/* ── Header Card ──────────────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border/60 p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div className="shrink-0 rounded-full ring-4 ring-background shadow-md">
                <UserAvatar
                  firstName={member.firstName}
                  lastName={member.lastName}
                  avatarUrl={member.avatarUrl}
                  seed={member.id}
                  size="2xl"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 data-tour="page-member" className="text-2xl font-bold tracking-tight text-foreground">
                    {member.firstName} {member.lastName}
                  </h1>
                  {member.isActive && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {t("common.active")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {member.position && (
                    <span className="text-sm text-muted-foreground">{member.position}</span>
                  )}
                  {member.position && <span className="text-muted-foreground/40">·</span>}
                  {(() => {
                    // Admin (system tier) always shows Admin; otherwise the named
                    // org role (Manager/custom); otherwise the plain tier label.
                    const named = member.role !== "ADMIN" ? member.memberRole : null
                    return named ? (
                      <Badge
                        variant="outline"
                        className="text-xs font-medium border gap-1"
                        style={{ borderColor: named.color || undefined, color: named.color || undefined }}
                      >
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: named.color || "#6b7280" }} />
                        {named.name}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={cn("text-xs font-medium border", roleConfig.className)}>
                        {t(roleConfig.labelKey)}
                      </Badge>
                    )
                  })()}
                  {scheduleLabel && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-medium border gap-1",
                          member.scheduleType === "FIXED"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/50"
                        )}
                      >
                        {member.scheduleType === "FIXED" ? <Clock className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
                        {scheduleLabel}
                      </Badge>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {member.email}
                </div>
                {spaceNames.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {spaceNames.map((name: string) => (
                      <Link key={name} href="/locations">
                        <Badge variant="secondary" className="text-xs font-normal py-0.5 px-2 gap-1 hover:bg-secondary/80 transition-colors cursor-pointer">
                          <MapPin className="h-3 w-3" />
                          {name}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Edit button — opens the same dialog inline (no redirect) */}
            {isAdmin && member.id !== user?.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
                className="rounded-lg shadow-sm"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {t("common.edit")}
              </Button>
            )}

            <EditMemberDialog
              member={editOpen ? member : null}
              onClose={() => setEditOpen(false)}
              onSaved={() => refetchMember()}
            />
          </div>
        </div>

        {/* ── Tabbed content ───────────────────────────────────────────── */}
        {(() => {
          const showAccessTab = isAdmin && member.role !== "ADMIN"
          // Schedule box is dynamic: only shows for a FIXED member that actually
          // has hours set. Flexible / none / empty → the box disappears entirely.
          const showSchedule = member.scheduleType === "FIXED" && (scheduleLoading || schedule.length > 0)

          const activityCard = (
            <div className="bg-card rounded-xl border border-border/80 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60">
                <h2 className="text-sm font-semibold text-foreground">{t("members.detail.activity")}</h2>
              </div>
              {tasksLoading ? (
                <div className="p-5 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-2 w-2 rounded-full" />
                      <Skeleton className="h-4 w-64" />
                      <Skeleton className="h-3 w-20 ml-auto" />
                    </div>
                  ))}
                </div>
              ) : tasks.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {tasks.slice(0, 5).map((task: Task) => {
                    const statusConfig = getStatusConfig(task.status)
                    return (
                      <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.hex }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">
                            <span className="font-medium">{task.title}</span>
                            <span className="text-muted-foreground"> - {statusConfig.label}</span>
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                          {formatRelativeDate(task.updatedAt, t)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">{t("members.detail.noRecentActivity")}</p>
                </div>
              )}
            </div>
          )

          const overview = (
            <div className="space-y-6">
              <div data-tour="member-tasks" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Recent Tasks ─────────────────────────────────────────── */}
          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border/60">
              <h2 className="text-sm font-semibold text-foreground">{t("members.detail.recentTasks")}</h2>
            </div>
            {tasksLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : tasks.length > 0 ? (
              <>
                <div className="divide-y divide-border/60">
                  {tasks.slice(0, 5).map((task: Task) => {
                    const statusConfig = getStatusConfig(task.status)
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => router.push(`/tasks/${task.id}`)}
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-accent/40 transition-colors text-left"
                      >
                        <div className="min-w-0 flex-1 mr-3">
                          <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t("members.detail.due", { date: new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) })}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[11px] font-medium border flex-shrink-0"
                          style={{ borderColor: `${statusConfig.hex}33`, color: statusConfig.hex, backgroundColor: `${statusConfig.hex}14` }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full mr-1.5 flex-shrink-0"
                            style={{ backgroundColor: statusConfig.hex }}
                          />
                          {statusConfig.label}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
                <div className="px-5 py-3 border-t border-border/60">
                  <Link
                    href={`/tasks?assignee=${memberId}`}
                    className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    {t("members.detail.viewAllTasks")}
                  </Link>
                </div>
              </>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("members.detail.noTasksAssigned")}</p>
              </div>
            )}
          </div>

          {/* ── Right column: Schedule if the member has fixed hours, else Activity ── */}
          {showSchedule ? (
            <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-border/60">
                <h2 className="text-sm font-semibold text-foreground">{t("members.detail.schedule")}</h2>
              </div>
              {scheduleLoading ? (
                <div className="p-5 space-y-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {DAY_KEYS.map((dayKey, i) => {
                    const entry = schedule.find((s: ScheduleEntry) => s.dayOfWeek === i)
                    const isActive = entry?.isActive
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center justify-between px-5 py-2.5",
                          !isActive && "opacity-40"
                        )}
                      >
                        <span className="text-sm font-medium text-foreground w-10">{t(`common.weekdaysShort.${dayKey}`)}</span>
                        <span className="text-sm text-muted-foreground">
                          {isActive
                            ? `${formatSchedule(entry!.startTime)} - ${formatSchedule(entry!.endTime)}`
                            : t("members.detail.off")
                          }
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : activityCard}
              </div>

              {/* Activity drops to a full-width row only when Schedule took the slot */}
              {showSchedule && activityCard}
            </div>
          )

          // No tabs to show (plain member viewing a peer / self) → just the overview.
          if (!showAccessTab && !canViewOps) return overview

          const triggerCls =
            "data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium transition-all gap-1.5"

          return (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="bg-card border border-border/60 rounded-xl p-1 shadow-sm h-auto flex-wrap">
                <TabsTrigger value="overview" className={triggerCls}>
                  <LayoutGrid className="size-3.5" />
                  {t("members.detail.overview")}
                </TabsTrigger>
                {showAccessTab && (
                  <TabsTrigger data-tour="access-tab" value="access" onClick={() => setActiveTab("access")} className={triggerCls}>
                    <ShieldCheck className="size-3.5" />
                    {t("members.detail.access")}
                  </TabsTrigger>
                )}
                {canViewOps && (
                  <>
                    <TabsTrigger value="tasks" className={triggerCls}>
                      <ClipboardList className="size-3.5" />
                      {t("technicians.detail.tabs.tasks")}
                    </TabsTrigger>
                    <TabsTrigger value="attendance" className={triggerCls}>
                      <Clock className="size-3.5" />
                      {t("technicians.detail.tabs.attendance")}
                    </TabsTrigger>
                    <TabsTrigger value="locations" className={triggerCls}>
                      <MapPin className="size-3.5" />
                      {t("technicians.detail.tabs.locations")}
                    </TabsTrigger>
                    <TabsTrigger value="schedule" className={triggerCls}>
                      <Calendar className="size-3.5" />
                      {t("technicians.detail.tabs.schedule")}
                    </TabsTrigger>
                    <TabsTrigger value="time-off" className={triggerCls}>
                      <Umbrella className="size-3.5" />
                      {t("technicians.detail.tabs.timeOff")}
                    </TabsTrigger>
                    <TabsTrigger value="performance" className={triggerCls}>
                      <BarChart3 className="size-3.5" />
                      {t("technicians.detail.tabs.performance")}
                    </TabsTrigger>
                  </>
                )}
              </TabsList>

              <TabsContent value="overview" className="mt-6">
                <div className="space-y-6">
                  {overview}
                  {/* Full accountability audit trail — managers only (self-gated) */}
                  <AuditTrail resourceType="members" resourceId={memberId} />
                </div>
              </TabsContent>

              {showAccessTab && (
                <TabsContent value="access" className="mt-6">
                  <div className="space-y-6">
                    <AccessBuilder member={member} onSaved={() => refetchMember()} />
                  </div>
                </TabsContent>
              )}

              {canViewOps && (
                <>
                  <TabsContent value="tasks" className="mt-6">
                    <TasksTab tasks={fullTasks} />
                    {(tasksPage > 1 || (fullTasks?.length ?? 0) >= TASKS_PAGE_SIZE) && (
                      <div className="mt-4 flex items-center justify-between">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={tasksPage <= 1}
                          onClick={() => setTasksPage((p) => Math.max(1, p - 1))}
                        >
                          {t("common.previous")}
                        </Button>
                        <span className="text-xs text-muted-foreground">{tasksPage}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={(fullTasks?.length ?? 0) < TASKS_PAGE_SIZE}
                          onClick={() => setTasksPage((p) => p + 1)}
                        >
                          {t("common.next")}
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="attendance" className="mt-6">
                    <AttendanceTab
                      attendance={attendance}
                      employeeId={memberId}
                      employeeName={`${member.firstName} ${member.lastName}`.trim()}
                      canManage={canManage}
                    />
                  </TabsContent>
                  <TabsContent value="locations" className="mt-6">
                    <LocationsTab assignments={memberAssignments} />
                  </TabsContent>
                  <TabsContent value="schedule" className="mt-6">
                    <ScheduleTab employeeId={memberId} canManage={canManage} />
                  </TabsContent>
                  <TabsContent value="time-off" className="mt-6">
                    <TimeOffTab employeeId={memberId} canManage={canManage} />
                  </TabsContent>
                  <TabsContent value="performance" className="mt-6">
                    <PerformanceTab performance={performance} />
                  </TabsContent>
                </>
              )}
            </Tabs>
          )
        })()}
      </div>
    </div>
  )
}
