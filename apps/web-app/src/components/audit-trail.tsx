"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { History, ChevronRight } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { organizationsApi } from "@/lib/api"
import { auditActionLabel } from "@/lib/audit-labels"
import { cn } from "@/lib/utils"
import { formatTimeAgo } from "@/lib/format-date"
import { Skeleton } from "@/components/ui/skeleton"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: string
  eventType: string
  userId: string | null
  user: { id: string; firstName: string; lastName: string; email: string } | null
  targetUserId: string | null
  targetUser: { id: string; firstName: string; lastName: string; email: string } | null
  resourceType: string | null
  resourceId: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Visibility — only managers (admins or canViewAllTasks) may see audit trails.
// ---------------------------------------------------------------------------

/** True when the current user is allowed to view per-entity audit trails. */
export function useCanViewAudit(): boolean {
  const { user } = useAuth()
  if (!user) return false
  return user.role === "ADMIN" || user.canViewAllTasks === true
}

// ---------------------------------------------------------------------------
// Hook — lazy, permission-aware audit query.
// ---------------------------------------------------------------------------

/**
 * Fetch the audit trail for a single entity. Fetches ONLY when:
 *  - a resourceId is set (so list pages never fire it), AND
 *  - opts.enabled !== false, AND
 *  - the current user may view audit (admin or canViewAllTasks).
 */
export function useAuditTrail(
  resourceType: string,
  resourceId: string | undefined,
  opts?: { limit?: number; enabled?: boolean },
) {
  const canView = useCanViewAudit()
  const limit = opts?.limit ?? 10
  const enabled = !!resourceId && opts?.enabled !== false && canView

  // Query by resourceId ONLY (not resourceType): sub-route mutations like a
  // task's status change (/tasks/:id/status) or assignment (/tasks/:id/assign)
  // are stored under a different resourceType but the SAME resourceId — and
  // resourceIds are globally-unique cuids, so this yields the COMPLETE trail for
  // the entity (who created/edited/assigned/moved/deleted it). Backed by the
  // [resourceId, createdAt] index. `resourceType` is kept for the query key /
  // context only.
  return useQuery({
    queryKey: ["auditTrail", resourceType, resourceId, limit],
    queryFn: () => organizationsApi.getAuditLogs({ resourceId, limit }),
    enabled,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// <AuditTrail> — compact, on-brand per-entity timeline.
// ---------------------------------------------------------------------------

interface AuditTrailProps {
  resourceType: string
  resourceId: string | undefined
  title?: string
  limit?: number
  className?: string
}

export function AuditTrail({
  resourceType,
  resourceId,
  title,
  limit = 10,
  className,
}: AuditTrailProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canView = useCanViewAudit()
  const isAdmin = user?.role === "ADMIN"

  const { data, isLoading } = useAuditTrail(resourceType, resourceId, { limit })

  // Gate: render nothing for users who can't view audit trails, or when there
  // is no entity yet.
  if (!canView || !resourceId) return null

  const logs = (data?.data ?? []) as AuditLogEntry[]

  return (
    <div className={cn("rounded-2xl border border-border bg-card", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            {title ?? t("audit.history")}
          </h3>
        </div>
        {isAdmin && (
          <Link
            href="/settings/audit-log"
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("audit.viewFull")}
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>

      <div className="p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-7 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3 rounded" />
                  <Skeleton className="h-2.5 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t("audit.noActivity")}
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {logs.map((log) => (
              <AuditRow key={log.id} log={log} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AuditRow({ log }: { log: AuditLogEntry }) {
  const { t } = useTranslation()
  const actorName = log.user
    ? `${log.user.firstName} ${log.user.lastName}`.trim()
    : t("auditLog.system")
  const initials = log.user
    ? `${(log.user.firstName || "").charAt(0)}${(log.user.lastName || "").charAt(0)}`.toUpperCase() || "?"
    : "•"

  const detail = auditRowDetail(log)

  return (
    <li className="flex items-start gap-3 px-2 py-2.5">
      <span
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
        aria-hidden
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground leading-snug">
          <span className="font-medium">{actorName}</span>{" "}
          <span className="text-muted-foreground">{auditActionLabel(log.eventType, t)}</span>
        </p>
        {detail && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{detail}</p>
        )}
      </div>
      <time className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
        {formatTimeAgo(log.createdAt)}
      </time>
    </li>
  )
}

/**
 * The handful of metadata fields this row knows how to summarise.
 *
 * The column is free-form JSON written by a dozen different handlers, so the
 * read stays best-effort — but naming the fields it looks for turns twelve
 * `as any` casts into one shape somebody can check against the writers.
 */
interface AuditRowMetadata {
  from?: unknown
  to?: unknown
  oldStatus?: unknown
  previousStatus?: unknown
  newStatus?: unknown
  status?: unknown
  role?: unknown
  reason?: unknown
  email?: unknown
}

/** Pull a short, human-readable detail out of the metadata (best effort). */
function auditRowDetail(log: AuditLogEntry): string | null {
  const m = log.metadata
  if (!m || typeof m !== "object") return null
  const meta = m as AuditRowMetadata
  const from = meta.from ?? meta.oldStatus ?? meta.previousStatus
  const to = meta.to ?? meta.newStatus ?? meta.status
  if (from && to && from !== to) return `${String(from)} → ${String(to)}`
  if (meta.role) return String(meta.role)
  if (meta.reason) return String(meta.reason)
  if (meta.email) return String(meta.email)
  if (log.targetUser) return `${log.targetUser.firstName} ${log.targetUser.lastName}`.trim()
  return null
}

// ---------------------------------------------------------------------------
// <Attribution> — tiny muted "Created by X · Updated …" line.
// ---------------------------------------------------------------------------

interface AttributionProps {
  createdBy?: { firstName?: string | null; lastName?: string | null } | string | null
  createdAt?: string | null
  updatedAt?: string | null
  className?: string
}

export function Attribution({ createdBy, createdAt, updatedAt, className }: AttributionProps) {
  const { t } = useTranslation()

  const name =
    typeof createdBy === "string"
      ? createdBy
      : createdBy
        ? `${createdBy.firstName ?? ""} ${createdBy.lastName ?? ""}`.trim()
        : null

  const parts: string[] = []
  if (name) {
    parts.push(
      createdAt
        ? `${t("audit.createdBy")} ${name} · ${formatTimeAgo(createdAt)}`
        : `${t("audit.createdBy")} ${name}`,
    )
  } else if (createdAt) {
    parts.push(formatTimeAgo(createdAt))
  }
  if (updatedAt) {
    parts.push(`${t("audit.updated")} · ${formatTimeAgo(updatedAt)}`)
  }

  if (parts.length === 0) return null

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {parts.join(" · ")}
    </p>
  )
}
