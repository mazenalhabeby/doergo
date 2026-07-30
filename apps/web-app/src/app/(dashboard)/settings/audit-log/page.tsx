"use client"

import { PlanGate } from "@/components/plan-gate"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Shield,
  User,
  Clock,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import Link from "next/link"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/contexts/auth-context"
import { organizationsApi } from "@/lib/api"
import { auditActionLabel } from "@/lib/audit-labels"
import { cn, formatTimeAgo } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"

// Color per event type — labels are translated via t("auditLog.events.<TYPE>").
const EVENT_COLORS: Record<string, string> = {
  USER_LOGIN: "text-green-600",
  USER_LOGOUT: "text-slate-500",
  USER_LOGIN_FAILED: "text-red-600",
  USER_CREATED: "text-blue-600",
  USER_UPDATED: "text-blue-600",
  USER_DELETED: "text-red-600",
  TASK_CREATED: "text-blue-600",
  TASK_ASSIGNED: "text-purple-600",
  TASK_STATUS_CHANGED: "text-amber-600",
  TASK_COMPLETED: "text-green-600",
  TASK_DELETED: "text-red-600",
  TASK_TYPE_CREATED: "text-blue-600",
  TASK_TYPE_DELETED: "text-red-600",
  CUSTOM_FIELD_CREATED: "text-blue-600",
  CUSTOM_FIELD_DELETED: "text-red-600",
  MEMBER_ROLE_CHANGED: "text-amber-600",
  MEMBER_REMOVED: "text-red-600",
  ORG_SETTINGS_UPDATED: "text-amber-600",
  ORG_JOIN_CODE_REGENERATED: "text-amber-600",
  INVITATION_CREATED: "text-blue-600",
  INVITATION_REVOKED: "text-red-600",
  INVITATION_ACCEPTED: "text-green-600",
  JOIN_REQUEST_APPROVED: "text-green-600",
  JOIN_REQUEST_REJECTED: "text-red-600",
  SPACE_CREATED: "text-blue-600",
  SPACE_DELETED: "text-red-600",
  RECURRING_CREATED: "text-blue-600",
  RECURRING_DELETED: "text-red-600",
  RECURRING_GENERATED: "text-purple-600",
  TECHNICIAN_CREATED: "text-blue-600",
  TECHNICIAN_DEACTIVATED: "text-red-600",
  CLOCK_IN: "text-green-600",
  CLOCK_OUT: "text-slate-600",
  GEOFENCE_VIOLATION: "text-red-600",
}

const EVENT_TYPES = Object.keys(EVENT_COLORS)

export default function AuditLogPage() {
  return (
    <PlanGate feature="audit_log">
      <AuditLogPageInner />
    </PlanGate>
  )
}

function AuditLogPageInner() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  // Translated label for an event type (shared helper: curated label →
  // per-entity extras → generic verb decomposition → humanized fallback).
  const evtLabel = (type: string) => auditActionLabel(type, t)

  const [page, setPage] = useState(1)
  const [eventFilter, setEventFilter] = useState<string>("__all__")
  const [userFilter, setUserFilter] = useState<string>("__all__")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")

  const { data: membersResp } = useQuery({
    queryKey: ["members-for-audit"],
    queryFn: () => organizationsApi.getMembers({ limit: 200 }),
    enabled: isAdmin,
  })
  const members = membersResp?.data ?? []

  const eventOptions = [
    { value: "__all__", label: t("auditLog.allEvents") },
    ...EVENT_TYPES.map((type) => ({ value: type, label: evtLabel(type), keywords: type })),
  ]
  const userOptions = [
    { value: "__all__", label: t("auditLog.allUsers") },
    ...members.map((m) => ({
      value: m.id,
      label: `${m.firstName} ${m.lastName}`,
      keywords: m.email,
    })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, eventFilter, userFilter, startDate, endDate],
    queryFn: () => organizationsApi.getAuditLogs({
      page,
      limit: 50,
      eventType: eventFilter !== "__all__" ? eventFilter : undefined,
      userId: userFilter !== "__all__" ? userFilter : undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate + "T23:59:59").toISOString() : undefined,
    }),
    enabled: isAdmin,
  })

  const logs = data?.data || []
  const meta = data?.meta

  if (!isAdmin) {
    return (
      <div className="min-h-full bg-muted p-8">
        <div className="max-w-5xl mx-auto text-center py-12">
          <Shield className="size-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium">{t("auditLog.accessDenied")}</p>
          <p className="text-sm text-muted-foreground">{t("auditLog.accessDeniedDescription")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-muted">
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{t("auditLog.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("auditLog.subtitle")}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <Filter className="size-4 text-muted-foreground" />
          <Combobox
            value={eventFilter}
            onChange={(v) => { setEventFilter(v); setPage(1) }}
            options={eventOptions}
            placeholder={t("auditLog.allEvents")}
            searchPlaceholder={t("auditLog.searchEvents")}
            className="h-8 rounded-lg text-sm w-[200px]"
            contentClassName="w-[240px]"
          />
          <Combobox
            value={userFilter}
            onChange={(v) => { setUserFilter(v); setPage(1) }}
            options={userOptions}
            placeholder={t("auditLog.allUsers")}
            searchPlaceholder={t("auditLog.searchUsers")}
            className="h-8 rounded-lg text-sm w-[180px]"
            contentClassName="w-[240px]"
          />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
            className="h-8 text-sm w-[150px]"
            title={t("auditLog.fromDate")}
          />
          <span className="text-xs text-muted-foreground">{t("common.to")}</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
            className="h-8 text-sm w-[150px]"
            title={t("auditLog.toDate")}
          />
          {(startDate || endDate || eventFilter !== "__all__" || userFilter !== "__all__") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setStartDate(""); setEndDate(""); setEventFilter("__all__"); setUserFilter("__all__"); setPage(1) }}
            >
              {t("auditLog.clear")}
            </Button>
          )}
          {meta && (
            <span className="text-xs text-muted-foreground ml-auto">{t("auditLog.totalEvents", { count: meta.total })}</span>
          )}
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_140px_140px_100px] gap-3 px-4 py-2.5 bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/30">
            <div>{t("auditLog.event")}</div>
            <div>{t("auditLog.user")}</div>
            <div>{t("auditLog.resource")}</div>
            <div className="text-right">{t("auditLog.time")}</div>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="size-10 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">{t("auditLog.noEvents")}</p>
            </div>
          ) : (
            logs.map((log: any) => {
              const evt = { label: evtLabel(log.eventType), color: EVENT_COLORS[log.eventType] || "text-foreground" }
              return (
                <div key={log.id} className="grid grid-cols-[1fr_140px_140px_100px] gap-3 px-4 py-2.5 border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors text-sm">
                  {/* Event */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("text-xs font-semibold", evt.color)}>{evt.label}</span>
                    {log.metadata && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {log.metadata.email || log.metadata.reason ||
                          (log.metadata.method && log.metadata.path
                            ? `${log.metadata.method} ${log.metadata.path}`
                            : "")}
                      </span>
                    )}
                  </div>

                  {/* User */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {log.user ? (
                      <Link href={`/members/${log.user.id}`} className="text-xs text-foreground truncate hover:text-blue-600 transition-colors">
                        {log.user.firstName} {log.user.lastName}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("auditLog.system")}</span>
                    )}
                  </div>

                  {/* Resource */}
                  <div className="text-xs text-muted-foreground truncate">
                    {log.resourceType && log.resourceId
                      ? `${log.resourceType}:${log.resourceId.slice(0, 8)}`
                      : "—"}
                  </div>

                  {/* Time */}
                  <div className="text-xs text-muted-foreground text-right">
                    {formatTimeAgo(log.createdAt)}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">
              {t("common.page", { page: meta.page, totalPages: meta.totalPages })}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page >= meta.totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
