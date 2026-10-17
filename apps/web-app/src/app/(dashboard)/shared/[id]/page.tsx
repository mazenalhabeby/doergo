"use client"

import { personName } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Building2,
  Loader2,
  Share2,
  ClipboardList,
  Plus,
  ListChecks,
  UserPlus,
  ShieldAlert,
  MapPin,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import {
  tasksApi,
  spaceSharingApi,
  locationsApi,
  attendanceApi,
  trackingApi,
  employeesApi,
  type Task,
  type SpaceShareRequestType,
  type SpaceShareRequestStatus,
  type TimeEntry,
  type EmployeeListItem,
} from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { PriorityBadge } from "@/components/tasks/priority-badge"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BackToSpaces, CenteredNotice } from "@/components/space-page"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { dateLocale } from "@/lib/format-date"
import { useSharedSpaceViewPage } from "./use-shared-space-view-page"
import {
  LEVEL_STYLES,
  REQUEST_STATUS_STYLES,
  AddWorkerDialog,
  CreateTaskDialog,
  RequestMoreDialog,
} from "./shared-space-view-page-helpers"
import { SharedSpaceViewPageGuest } from "./shared-space-view-page-guest"
import { SharedSpaceViewPageGuest2 } from "./shared-space-view-page-guest2"

export default function SharedSpaceViewPage() {
  const vm = useSharedSpaceViewPage()
  const {
    t,
    spaceId,
    user,
    share,
    canCreate,
    canAssign,
    canManageMembers,
    requestOpen,
    setRequestOpen,
    createOpen,
    setCreateOpen,
    addWorkerOpen,
    setAddWorkerOpen,
    isLoading,
    tasks,
    myRequests,
    workers,
    attendanceEntries,
    tracked,
    assignMutation,
    shareId,
  } = vm

  // Not an active shared space for this org (e.g. still pending or revoked).
  if (!share) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-[1100px] mx-auto px-6 py-6">
          <BackToSpaces />
          <CenteredNotice
            icon={ShieldAlert}
            title={t("spaceSharing.guest.notFound.title")}
            description={t("spaceSharing.guest.notFound.description")}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        {/* Header */}
        <SharedSpaceViewPageGuest2 vm={vm} />

        {/* Task board (read-only) */}
        <SharedSpaceViewPageGuest vm={vm} />

        {/* Workers on this space (owner enabled "show workers") */}
        {share.showWorkers && workers && workers.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <h2
                className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.workersHeading", "Workers on this workspace")}</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {workers.map((w) => (
                <div key={w.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <UserAvatar firstName={w.user?.firstName} lastName={w.user?.lastName} seed={w.user?.id} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {personName(w.user)}
                    </p>
                    {w.currentTask ? (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">{w.currentTask}</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground truncate">{w.user?.email}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live locations (owner enabled "show tracking") */}
        {share.showTracking && tracked && tracked.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.trackingHeading", "Live locations")}</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {tracked.map((w) => {
                // `updatedAt` is optional: new Date(undefined) is an Invalid
                // Date, and the row read "NaN min ago" rather than showing nothing.
                const seenAt = w.updatedAt ? new Date(w.updatedAt).getTime() : null
                const mins = seenAt ? Math.round((Date.now() - seenAt) / 60000) : null
                const ago = mins == null
                  ? ""
                  : mins <= 1
                    ? t("spaceSharing.guest.justNow", "just now")
                    : t("spaceSharing.guest.minsAgo", "{{m}} min ago", { m: mins })
                return (
                  <div key={w.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                    <UserAvatar firstName={w.firstName} lastName={w.lastName} seed={w.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{personName(w)}</p>
                      {w.currentTask ? (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">{w.currentTask.title}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">{ago}</p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                      <span className="size-1.5 rounded-full bg-emerald-500" /> {ago}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Attendance (owner enabled "show attendance") */}
        {share.showAttendance && attendanceEntries.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.attendanceHeading", "Attendance")}</h2>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              {attendanceEntries.slice(0, 25).map((e) => {
                const fmt = (d?: string | null) => (d
                  ? new Date(d).toLocaleString(dateLocale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                  : "—")
                return (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/20 last:border-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar firstName={e.user?.firstName} lastName={e.user?.lastName} seed={e.user?.id} size="sm" />
                      <span className="text-sm font-medium text-foreground truncate">{personName(e.user)}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      <span>{fmt(e.clockInAt)}</span>
                      <span>→</span>
                      <span>{e.clockOutAt
                        ? fmt(e.clockOutAt)
                        : <span className="text-emerald-600 dark:text-emerald-400">{t("attendance.status.active", "Active")}</span>}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Guest's own requests */}
        {share.allowRequests && myRequests && myRequests.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.myRequests")}</h2>
            </div>
            <div className="grid gap-2">
              {myRequests.map((req) => (
                <div key={req.id} className="rounded-xl border bg-card p-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        {req.type === "WORKER" ? <UserPlus className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{req.title}</p>
                        {req.note && <p className="text-xs text-muted-foreground truncate">{req.note}</p>}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("text-[11px] font-medium shrink-0", REQUEST_STATUS_STYLES[req.status])}>
                      {t(`spaceSharing.requestStatuses.${req.status}`)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {share.allowRequests && (
          <RequestMoreDialog spaceId={spaceId} shareId={shareId} open={requestOpen} onOpenChange={setRequestOpen} />
        )}
        {canCreate && (
          <CreateTaskDialog spaceId={spaceId} open={createOpen} onOpenChange={setCreateOpen} />
        )}
        {canManageMembers && (
          <AddWorkerDialog spaceId={spaceId} open={addWorkerOpen} onOpenChange={setAddWorkerOpen} />
        )}
      </div>
    </div>
  )
}
