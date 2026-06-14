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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, eventFilter],
    queryFn: () => organizationsApi.getAuditLogs({
      page,
      limit: 50,
      eventType: eventFilter !== "__all__" ? eventFilter : undefined,
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
          <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setPage(1) }}>
            <SelectTrigger className="h-8 text-sm w-[200px]">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All events</SelectItem>
              {EVENT_TYPES.map(type => (
                <SelectItem key={type} value={type}>
                  {EVENT_LABELS[type]?.label || type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                        {log.metadata.email || log.metadata.reason || ""}
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
