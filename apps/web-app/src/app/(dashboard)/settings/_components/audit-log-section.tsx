"use client"

import { personName } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Shield, Filter } from "lucide-react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { organizationsApi } from "@/lib/api"
import { auditActionLabel } from "@/lib/audit-labels"
import { cn } from "@/lib/utils"
import { formatTimeAgo } from "@/lib/format-date"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DatePicker } from "@/components/ui/date-picker"
import { Combobox } from "@/components/ui/combobox"
import { auditDetail, EVENT_COLORS, EVENT_TYPES } from "./audit-log-events"
import { ListPager } from "@/components/ui/list-pager"

/** The organization's audit log — a Settings section (its only entry point). */
export function AuditLogSection() {
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
    queryKey: keys.members.directory(),
    queryFn: () => organizationsApi.getAllMembers(),
    enabled: isAdmin,
  })
  const members = membersResp ?? []

  const eventOptions = [
    { value: "__all__", label: t("auditLog.allEvents") },
    ...EVENT_TYPES.map((type) => ({ value: type, label: evtLabel(type), keywords: type })),
  ]
  const userOptions = [
    { value: "__all__", label: t("auditLog.allUsers") },
    ...members.map((m) => ({
      value: m.id,
      label: personName(m),
      keywords: m.email,
    })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: keys.reports.auditLogs(page, eventFilter, userFilter, startDate, endDate),
    queryFn: () =>
      organizationsApi.getAuditLogs({
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
      <div>
        <div className="text-center py-12">
          <Shield className="size-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium">{t("auditLog.accessDenied")}</p>
          <p className="text-sm text-muted-foreground">{t("auditLog.accessDeniedDescription")}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("auditLog.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("auditLog.subtitle")}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <Filter className="size-4 text-muted-foreground" />
          <Combobox
            value={eventFilter}
            onChange={(v) => {
              setEventFilter(v)
              setPage(1)
            }}
            options={eventOptions}
            placeholder={t("auditLog.allEvents")}
            searchPlaceholder={t("auditLog.searchEvents")}
            className="h-8 rounded-lg text-sm w-[200px]"
            contentClassName="w-[240px]"
          />
          <Combobox
            value={userFilter}
            onChange={(v) => {
              setUserFilter(v)
              setPage(1)
            }}
            options={userOptions}
            placeholder={t("auditLog.allUsers")}
            searchPlaceholder={t("auditLog.searchUsers")}
            className="h-8 rounded-lg text-sm w-[180px]"
            contentClassName="w-[240px]"
          />
          <DatePicker
            value={startDate}
            onChange={(v) => {
              setStartDate(v)
              setPage(1)
            }}
            clearable
            triggerClassName="h-8 text-sm w-[150px]"
            title={t("auditLog.fromDate")}
            aria-label={t("auditLog.fromDate")}
          />
          <span className="text-xs text-muted-foreground">{t("common.to")}</span>
          <DatePicker
            value={endDate}
            onChange={(v) => {
              setEndDate(v)
              setPage(1)
            }}
            clearable
            triggerClassName="h-8 text-sm w-[150px]"
            title={t("auditLog.toDate")}
            aria-label={t("auditLog.toDate")}
          />
          {(startDate || endDate || eventFilter !== "__all__" || userFilter !== "__all__") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setStartDate("")
                setEndDate("")
                setEventFilter("__all__")
                setUserFilter("__all__")
                setPage(1)
              }}
            >
              {t("auditLog.clear")}
            </Button>
          )}
          {meta && (
            <span className="text-xs text-muted-foreground ml-auto">
              {t("auditLog.totalEvents", { count: meta.total })}
            </span>
          )}
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {/* Header */}
          <div
            className={
              "grid grid-cols-[1fr_140px_140px_100px] gap-3 px-4 py-2.5 bg-muted/30 " +
              "text-[11px] font-medium text-muted-foreground uppercase tracking-wider " +
              "border-b border-border/30"
            }
          >
            <div>{t("auditLog.event")}</div>
            <div>{t("auditLog.user")}</div>
            <div>{t("auditLog.resource")}</div>
            <div className="text-right">{t("auditLog.time")}</div>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="size-10 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">{t("auditLog.noEvents")}</p>
            </div>
          ) : (
            logs.map((log) => {
              const evt = { label: evtLabel(log.eventType), color: EVENT_COLORS[log.eventType] || "text-foreground" }
              return (
                <div
                  key={log.id}
                  className={
                    "grid grid-cols-[1fr_140px_140px_100px] gap-3 px-4 py-2.5 border-b " +
                    "border-border/20 last:border-0 hover:bg-muted/20 transition-colors " +
                    "text-sm"
                  }
                >
                  {/* Event */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("text-xs font-semibold", evt.color)}>{evt.label}</span>
                    {log.metadata && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {/* Free-form JSON: coerced for display rather than
                            trusted to already be a string. */}
                        {auditDetail(log.metadata)}
                      </span>
                    )}
                  </div>

                  {/* User */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {log.user ? (
                      <Link
                        href={`/members/${log.user.id}`}
                        className="text-xs text-foreground truncate hover:text-shell-accent transition-colors"
                      >
                        {personName(log.user)}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("auditLog.system")}</span>
                    )}
                  </div>

                  {/* Resource */}
                  <div className="text-xs text-muted-foreground truncate">
                    {log.resourceType && log.resourceId ? `${log.resourceType}:${log.resourceId.slice(0, 8)}` : "—"}
                  </div>

                  {/* Time */}
                  <div className="text-xs text-muted-foreground text-right">{formatTimeAgo(log.createdAt)}</div>
                </div>
              )
            })
          )}
        </div>

        {meta && <ListPager page={page} totalPages={meta.totalPages} setPage={setPage} framed={false} />}
      </div>
    </div>
  )
}
