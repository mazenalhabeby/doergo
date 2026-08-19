"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  MessageCircle,
  Phone,
  Video,
  TrendingUp,
  ArrowUpRight,
  MapPin,
  Mail,
  Briefcase,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useContactActions } from "@/hooks/use-contact-actions"
import { employeesApi } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { notify } from "@/lib/toast"
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer"

export interface EmployeeDetailPanelProps {
  employeeId: string | null
  open: boolean
  onClose: () => void
}

const STATUS_CONFIG: Record<string, { labelKey: string; dot: string; bg: string }> = {
  IN_PROGRESS: { labelKey: "dashboard.employeePanel.statusWorking", dot: "bg-amber-500", bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  EN_ROUTE: { labelKey: "dashboard.employeePanel.statusEnRoute", dot: "bg-blue-500", bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  ARRIVED: { labelKey: "dashboard.employeePanel.statusOnSite", dot: "bg-green-500", bg: "bg-green-500/10 text-green-700 dark:text-green-400" },
  BLOCKED: { labelKey: "dashboard.employeePanel.statusBlocked", dot: "bg-red-500", bg: "bg-red-500/10 text-red-600 dark:text-red-400" },
  ASSIGNED: { labelKey: "dashboard.employeePanel.statusAssigned", dot: "bg-purple-500", bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
}

export function EmployeeDetailPanel({ employeeId, open, onClose }: EmployeeDetailPanelProps) {
  const { t } = useTranslation()
  const { message, canMessage } = useContactActions()
  const router = useRouter()

  const { data: detail, isLoading } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => employeesApi.getById(employeeId!),
    enabled: !!employeeId && open,
  })

  const { data: tasksData } = useQuery({
    queryKey: ["employeeTasks", employeeId],
    queryFn: () => employeesApi.getTasks(employeeId!),
    enabled: !!employeeId && open,
  })

  const employee = (detail as any)?.data || detail
  const tasks = (tasksData as any)?.data || tasksData || []
  const stats = employee?.stats
  const activeTasks = Array.isArray(tasks) ? tasks.filter((t: any) => ["IN_PROGRESS", "EN_ROUTE", "ARRIVED", "BLOCKED", "ASSIGNED"].includes(t.status)) : []
  const completedCount = stats?.tasks?.completed ?? (Array.isArray(tasks) ? tasks.filter((t: any) => t.status === "COMPLETED").length : 0)
  const hoursWeek = stats?.attendance?.hoursThisWeek
  const onTimeRate = stats?.performance?.onTimeRate
  const rating = stats?.performance?.customerRating

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[80vh] focus:outline-none">
        <DrawerTitle className="sr-only">{t("dashboard.employeePanel.title")}</DrawerTitle>

        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {isLoading || !employee ? (
          <LoadingSkeleton />
        ) : (
          <div className="overflow-y-auto">
            {/* ── Profile Section ──────────────────────────────── */}
            <div className="px-6 pt-3 pb-5">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="relative">
                  <UserAvatar
                    firstName={employee.firstName}
                    lastName={employee.lastName}
                    avatarUrl={employee.avatarUrl}
                    seed={employee.id}
                    size="xl"
                  />
                  <span className={cn(
                    "absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-card",
                    employee.isOnline ? "bg-green-500" : "bg-muted-foreground/30",
                  )} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="text-lg font-semibold text-foreground leading-tight">
                    {employee.firstName} {employee.lastName}
                  </h3>
                  {(employee.position || employee.specialty) && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Briefcase className="size-3 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {employee.position || employee.specialty}
                      </span>
                    </div>
                  )}
                  {employee.email && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Mail className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground truncate">{employee.email}</span>
                    </div>
                  )}
                </div>

                {/* Quick Actions — hidden on your own card: chat refuses a
                    conversation with yourself, so these would do nothing. */}
                {canMessage(employee.id) && (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => message(employee.id)}
                    className="size-9 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
                  >
                    <MessageCircle className="size-4" />
                  </button>
                  <button
                    onClick={() => notify.success(t("workspace.voiceCallComingSoon"))}
                    className="size-9 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-accent transition-colors text-foreground"
                  >
                    <Phone className="size-4" />
                  </button>
                  <button
                    onClick={() => notify.success(t("workspace.videoCallComingSoon"))}
                    className="size-9 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-accent transition-colors text-foreground"
                  >
                    <Video className="size-4" />
                  </button>
                </div>
                )}
              </div>
            </div>

            {/* ── Stats ───────────────────────────────────────── */}
            <div className="px-6 pb-5">
              <div className="grid grid-cols-4 gap-3">
                <StatCard
                  value={String(completedCount)}
                  label={t("dashboard.employeePanel.completed")}
                  icon={<CheckCircle2 className="size-4 text-green-500" />}
                />
                <StatCard
                  value={String(activeTasks.length)}
                  label={t("dashboard.employeePanel.active")}
                  icon={<ClipboardList className="size-4 text-blue-500" />}
                />
                <StatCard
                  value={hoursWeek != null ? `${Math.round(hoursWeek)}h` : "—"}
                  label={t("dashboard.employeePanel.hrsWeek")}
                  icon={<Clock className="size-4 text-amber-500" />}
                />
                <StatCard
                  value={onTimeRate != null ? `${Math.round(onTimeRate)}%` : "—"}
                  label={t("dashboard.employeePanel.onTime")}
                  icon={<TrendingUp className="size-4 text-purple-500" />}
                />
              </div>
            </div>

            {/* ── Active Tasks ─────────────────────────────────── */}
            {activeTasks.length > 0 && (
              <div className="px-6 pb-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("dashboard.employeePanel.activeTasks")}
                  </h4>
                  <button
                    onClick={() => { onClose(); router.push(`/tasks?assignee=${employeeId}`) }}
                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    {t("dashboard.admin.viewAll")} <ArrowUpRight className="size-2.5" />
                  </button>
                </div>
                <div className="space-y-2">
                  {activeTasks.slice(0, 3).map((task: any) => {
                    const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.ASSIGNED!
                    return (
                      <button
                        key={task.id}
                        onClick={() => { onClose(); router.push(`/tasks/${task.id}`) }}
                        className="w-full text-left group rounded-xl bg-card border border-border/50 hover:border-border hover:shadow-sm transition-all p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                              {task.title}
                            </p>
                            {task.locationAddress && (
                              <div className="flex items-center gap-1 mt-1">
                                <MapPin className="size-2.5 text-muted-foreground shrink-0" />
                                <span className="text-[10px] text-muted-foreground truncate">{task.locationAddress}</span>
                              </div>
                            )}
                          </div>
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1", cfg.bg)}>
                            <span className={cn("size-1.5 rounded-full", cfg.dot)} />
                            {t(cfg!.labelKey)}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── No tasks empty state ─────────────────────────── */}
            {activeTasks.length === 0 && !isLoading && (
              <div className="px-6 pb-5">
                <div className="rounded-xl bg-muted/30 border border-border/30 py-6 text-center">
                  <ClipboardList className="size-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t("dashboard.employeePanel.noActiveTasks")}</p>
                </div>
              </div>
            )}

            {/* Bottom padding for safe area */}
            <div className="h-2" />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/30 border border-border/30 py-3 px-2 text-center">
      <div className="flex justify-center mb-1.5">{icon}</div>
      <p className="text-xl font-bold text-foreground tabular-nums leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
    </div>
  )
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="px-6 py-4 space-y-5">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <div className="flex gap-1">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    </div>
  )
}
