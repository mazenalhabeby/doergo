"use client"

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

import { useAuth } from "@/contexts/auth-context"
import { organizationsApi } from "@/lib/api"
import { cn, formatTimeAgo } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  USER_LOGIN: { label: "Login", color: "text-green-600" },
  USER_LOGOUT: { label: "Logout", color: "text-slate-500" },
  USER_LOGIN_FAILED: { label: "Login Failed", color: "text-red-600" },
  USER_CREATED: { label: "User Created", color: "text-blue-600" },
  USER_UPDATED: { label: "User Updated", color: "text-blue-600" },
  USER_DELETED: { label: "User Deleted", color: "text-red-600" },
  TASK_CREATED: { label: "Task Created", color: "text-blue-600" },
  TASK_ASSIGNED: { label: "Task Assigned", color: "text-purple-600" },
  TASK_STATUS_CHANGED: { label: "Status Changed", color: "text-amber-600" },
  TASK_COMPLETED: { label: "Task Completed", color: "text-green-600" },
  TASK_DELETED: { label: "Task Deleted", color: "text-red-600" },
  TASK_TYPE_CREATED: { label: "Task Type Created", color: "text-blue-600" },
  TASK_TYPE_DELETED: { label: "Task Type Deleted", color: "text-red-600" },
  CUSTOM_FIELD_CREATED: { label: "Custom Field Created", color: "text-blue-600" },
  CUSTOM_FIELD_DELETED: { label: "Custom Field Deleted", color: "text-red-600" },
  MEMBER_ROLE_CHANGED: { label: "Member Role Changed", color: "text-amber-600" },
  MEMBER_REMOVED: { label: "Member Removed", color: "text-red-600" },
  ORG_SETTINGS_UPDATED: { label: "Org Settings Updated", color: "text-amber-600" },
  ORG_JOIN_CODE_REGENERATED: { label: "Join Code Regenerated", color: "text-amber-600" },
  INVITATION_CREATED: { label: "Invitation Created", color: "text-blue-600" },
  INVITATION_REVOKED: { label: "Invitation Revoked", color: "text-red-600" },
  INVITATION_ACCEPTED: { label: "Invitation Accepted", color: "text-green-600" },
  JOIN_REQUEST_APPROVED: { label: "Join Approved", color: "text-green-600" },
  JOIN_REQUEST_REJECTED: { label: "Join Rejected", color: "text-red-600" },
  SPACE_CREATED: { label: "Space Created", color: "text-blue-600" },
  SPACE_DELETED: { label: "Space Deleted", color: "text-red-600" },
  RECURRING_CREATED: { label: "Recurring Created", color: "text-blue-600" },
  RECURRING_DELETED: { label: "Recurring Deleted", color: "text-red-600" },
  RECURRING_GENERATED: { label: "Recurring Generated", color: "text-purple-600" },
  TECHNICIAN_CREATED: { label: "Technician Created", color: "text-blue-600" },
  TECHNICIAN_DEACTIVATED: { label: "Technician Deactivated", color: "text-red-600" },
  CLOCK_IN: { label: "Clock In", color: "text-green-600" },
  CLOCK_OUT: { label: "Clock Out", color: "text-slate-600" },
  GEOFENCE_VIOLATION: { label: "Geofence Violation", color: "text-red-600" },
}

const EVENT_TYPES = Object.keys(EVENT_LABELS)

export default function AuditLogPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

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
    { value: "__all__", label: "All events" },
    ...EVENT_TYPES.map((t) => ({ value: t, label: EVENT_LABELS[t]?.label || t, keywords: t })),
  ]
  const userOptions = [
    { value: "__all__", label: "All users" },
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
          <p className="text-lg font-medium">Access Denied</p>
          <p className="text-sm text-muted-foreground">Only admins can view audit logs.</p>
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
            <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>
            <p className="text-sm text-muted-foreground mt-1">Track all security and administrative events</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <Filter className="size-4 text-muted-foreground" />
          <Combobox
            value={eventFilter}
            onChange={(v) => { setEventFilter(v); setPage(1) }}
            options={eventOptions}
            placeholder="All events"
            searchPlaceholder="Search events…"
            className="h-8 rounded-lg text-sm w-[200px]"
            contentClassName="w-[240px]"
          />
          <Combobox
            value={userFilter}
            onChange={(v) => { setUserFilter(v); setPage(1) }}
            options={userOptions}
            placeholder="All users"
            searchPlaceholder="Search users…"
            className="h-8 rounded-lg text-sm w-[180px]"
            contentClassName="w-[240px]"
          />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
            className="h-8 text-sm w-[150px]"
            title="From date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
            className="h-8 text-sm w-[150px]"
            title="To date"
          />
          {(startDate || endDate || eventFilter !== "__all__" || userFilter !== "__all__") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setStartDate(""); setEndDate(""); setEventFilter("__all__"); setUserFilter("__all__"); setPage(1) }}
            >
              Clear
            </Button>
          )}
          {meta && (
            <span className="text-xs text-muted-foreground ml-auto">{meta.total} total events</span>
          )}
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_140px_140px_100px] gap-3 px-4 py-2.5 bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/30">
            <div>Event</div>
            <div>User</div>
            <div>Resource</div>
            <div className="text-right">Time</div>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="size-10 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No audit events found</p>
            </div>
          ) : (
            logs.map((log: any) => {
              const evt = EVENT_LABELS[log.eventType] || { label: log.eventType, color: "text-foreground" }
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
                      <span className="text-xs text-muted-foreground">System</span>
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
              Page {meta.page} of {meta.totalPages}
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
