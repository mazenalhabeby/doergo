"use client"

import { personName } from "@hbcfield/shared/client"
import { PlanGate } from "@/components/plan-gate"
import { DecideInApprovals } from "@/components/approvals/decide-in-approvals"
import type { LucideIcon } from "lucide-react"
import { useState} from "react"
import { cn } from "@/lib/utils"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { useTimeFormat } from "@/hooks"
import { notify } from "@/lib/toast"
import { format } from "date-fns"
import { shiftLength} from "./_lib/countdown"
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Timer,
  User,
  Pen,
  Zap,
  Loader2,
} from "lucide-react"

import {
  overtimeApi,
  type OvertimeRequest,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { keys } from "@/lib/query-keys"

const STATUS_BADGES: Record<string, { labelKey: string; className: string; icon: LucideIcon }> = {
  PENDING_TECHNICIAN: { labelKey: "overtime.badges.awaitingEmployee", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Clock },
  PENDING_APPROVAL: { labelKey: "overtime.badges.needsApproval", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: AlertTriangle },
  APPROVED: { labelKey: "overtime.badges.active", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  REJECTED: { labelKey: "overtime.badges.rejected", className: "bg-red-500/15 text-red-600 dark:text-red-400", icon: XCircle },
  /*
    Two different failures, shown identically until now — both said "Expired".

    NO_RESPONSE is the employee never answering; NO_APPROVAL is the request
    reaching an approver who never answered. The second is the organisation's
    own miss, and the one a manager reviewing this list should be able to see,
    so it is marked rather than greyed out with the rest.
  */
  EXPIRED_NO_RESPONSE: { labelKey: "overtime.badges.noEmployeeReply", className: "bg-muted text-muted-foreground", icon: Clock },
  EXPIRED_NO_APPROVAL: { labelKey: "overtime.badges.missedByApprover", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400", icon: AlertTriangle },
  COMPLETED: { labelKey: "overtime.badges.completed", className: "bg-muted text-foreground", icon: CheckCircle2 },
  CANCELED: { labelKey: "overtime.badges.declined", className: "bg-muted text-muted-foreground", icon: XCircle },
}


export default function OvertimePage() {
  return (
    <PlanGate feature="overtime">
      <OvertimePageInner />
    </PlanGate>
  )
}

function OvertimePageInner() {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  // History filters
  const [historyStatus, setHistoryStatus] = useState("all")
  const [historyPage, setHistoryPage] = useState(1)

  const removeMutation = useMutation({
    mutationFn: (id: string) => overtimeApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.overtime.history() })
      queryClient.invalidateQueries({ queryKey: keys.overtime.pending() })
      // The day's hours changed: what is still to bill must re-read them.
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
      notify.success(t("overtime.removed"))
    },
    onError: (e: Error) => notify.error(e.message),
  })
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: keys.overtime.history(historyStatus, historyPage),
    queryFn: () => overtimeApi.getHistory({
      status: historyStatus === "all" ? undefined : historyStatus,
      page: historyPage,
      limit: 15,
    }),
  })

  /*
    A triage layer, which the page had none of.

    It opened straight onto two cards on an otherwise empty screen: no sense of
    how much is waiting, how long it would cost in hours, or what is running
    right now. Approval-queue practice is consistent on this — a manager
    processing a queue needs the staffing and hours impact of saying yes, not
    just the individual request in front of them.

    Every figure below is derived from data that exists. There is no hourly
    rate anywhere in the schema, so there is no euro cost here — that number
    would be invented, and on a screen about authorising spend an invented
    figure is worse than a missing one.
  */
  const historyRows: OvertimeRequest[] = (historyData?.data as OvertimeRequest[]) ?? []
  const weekAgo = Date.now() - 7 * 86_400_000

  const stats = {
    running: historyRows.filter((r) => r.status === "APPROVED").length,
    approvedThisWeek: historyRows.filter(
      (r) => (r.status === "APPROVED" || r.status === "COMPLETED") &&
             new Date(r.approvedAt ?? r.createdAt).getTime() >= weekAgo,
    ).length,
  }

  const history = historyData?.data || []
  const historyMeta = historyData?.meta

  /*
    This page had no permission check of any kind: 478 lines of approve and
    reject controls rendered for anyone who reached the URL, and every request
    behind them 403s without `canApproveOvertime` — the exact "the app offered
    it and the server refused" shape.

    `hasPermission` is space-aware, matching `@RequirePermissionInSpace` on all
    four routes, so a shift leader or site supervisor granted it by a space role
    passes here exactly as they do at the API.
  */
  if (!(user?.role === "ADMIN" || hasPermission("canApproveOvertime"))) {
    return (
      <div className="min-h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <XCircle className="size-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">{t("common.accessDenied")}</h2>
          <p className="text-muted-foreground mt-2">{t("common.noPermissionView")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 data-tour="page-overtime" className="text-3xl font-bold text-foreground tracking-tight">{t("overtime.title")}</h1>
              <p className="mt-1.5 text-muted-foreground">
                {t("overtime.subtitle")}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl border-border/80 shadow-sm"
              onClick={() => refetchHistory()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Triage. The page opened onto two cards and a lot of empty screen —
            no sense of how much was waiting, what it would cost in hours, or
            what was already running. */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <StatTile
            icon={Zap}
            value={String(stats.running)}
            label={t("overtime.statRunning")}
            tone={stats.running > 0 ? "emerald" : undefined}
          />
          <StatTile
            icon={CheckCircle2}
            value={String(stats.approvedThisWeek)}
            label={t("overtime.statThisWeek")}
          />
        </div>

        {/* Decisions are made in Approvals; this page is the record. */}
        <DecideInApprovals kinds={["overtime", "extraTime"]} className="mb-6" />

          <div>
            <div className="flex items-center justify-between mb-4">
              <Select value={historyStatus} onValueChange={(v) => { setHistoryStatus(v); setHistoryPage(1); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t("common.filterByStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
                  <SelectItem value="APPROVED">{t("overtime.filterApproved")}</SelectItem>
                  <SelectItem value="COMPLETED">{t("overtime.filterCompleted")}</SelectItem>
                  <SelectItem value="REJECTED">{t("overtime.filterRejected")}</SelectItem>
                  <SelectItem value="CANCELED">{t("overtime.filterDeclined")}</SelectItem>
                  <SelectItem value="EXPIRED_NO_RESPONSE">{t("overtime.expiredNoResponse")}</SelectItem>
                  <SelectItem value="EXPIRED_NO_APPROVAL">{t("overtime.expiredNoApproval")}</SelectItem>
                </SelectContent>
              </Select>
              {historyMeta && (
                <p className="text-sm text-muted-foreground">
                  {t(historyMeta.total === 1 ? "overtime.requestCountOne" : "overtime.requestCountOther", { count: historyMeta.total })}
                </p>
              )}
            </div>

            {historyLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Clock className="h-8 w-8 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground">{t("overtime.historyEmpty")}</h3>
              </div>
            ) : (
              <div className="grid gap-3">
                {history.map((req: OvertimeRequest) => (
                  <HistoryCard key={req.id} request={req} onRemove={() => removeMutation.mutate(req.id)} removing={removeMutation.isPending && removeMutation.variables === req.id} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {historyMeta && historyMeta.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>
                  {t("common.previous")}
                </Button>
                <span className="text-sm text-muted-foreground">{t("common.page", { page: historyPage, totalPages: historyMeta.totalPages })}</span>
                <Button variant="outline" size="sm" disabled={historyPage >= historyMeta.totalPages} onClick={() => setHistoryPage(historyPage + 1)}>
                  {t("common.next")}
                </Button>
              </div>
            )}
          </div>

      </div>
    </div>
  )
}

function HistoryCard({ request, onRemove, removing }: { request: OvertimeRequest; onRemove?: () => void; removing?: boolean }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const { timeToken } = useTimeFormat()
  const badge = STATUS_BADGES[request.status] || STATUS_BADGES.COMPLETED
  const Icon = badge!.icon

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground text-sm">
                {personName(request.technician)}
              </span>
              <Badge variant="outline" className={`text-xs ${badge!.className}`}>{t(badge!.labelKey)}</Badge>
              {/* Approved overtime can be taken off as if it never was — the shift end moves back, the day is recounted. */}
              {onRemove && (request.status === "APPROVED" || request.status === "COMPLETED") && (
                confirming ? (
                  <span className="flex items-center gap-1">
                    <Button size="sm" variant="destructive" className="h-6 px-2 text-[11px]" disabled={removing} onClick={onRemove}>
                      {removing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      {t("overtime.removeConfirm")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setConfirming(false)}>{t("common.cancel")}</Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-muted-foreground hover:text-red-600" onClick={() => setConfirming(true)}>
                    {t("overtime.remove")}
                  </Button>
                )
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{request.location?.name}</span>
              <span>{format(new Date(request.createdAt), `MMM d, ${timeToken}`)}</span>
              {/* How much overtime was actually worked — the fact the whole
                  record exists to capture. It was rendered only when the
                  backend had computed overtimeMinutes, which it does not for a
                  request that was approved and is still running, so the number
                  simply vanished from the rows most worth reading. */}
              {(() => {
                /*
                  Only a request that RAN has a duration.

                  Counting to now for anything without an end date claimed
                  "1017 min overtime" on a REJECTED request — overtime that was
                  refused and never worked, growing by a minute every minute.
                  A finished request uses its own end; only an APPROVED one is
                  still running and may count against the clock.
                */
                const ran = request.status === "APPROVED" || request.status === "COMPLETED"
                const end = request.overtimeEndAt
                  ? new Date(request.overtimeEndAt).getTime()
                  : request.status === "APPROVED" ? Date.now() : null
                const worked = request.overtimeMinutes
                  ?? (ran && request.overtimeStartAt && end !== null
                      ? Math.round((end - new Date(request.overtimeStartAt).getTime()) / 60_000)
                      : null)
                if (!worked || worked <= 0) return null
                return (
                  <span className="font-medium text-foreground">
                    {t("overtime.minOvertime", { count: worked })}
                    {!request.overtimeEndAt && request.status === "APPROVED" && (
                      <span className="ml-1 text-emerald-600 dark:text-emerald-400">{t("overtime.andCounting")}</span>
                    )}
                  </span>
                )
              })()}
              {/* The shift this overtime sat on top of. Two hours after a
                  seven-hour day and two after a twelve-hour one are not the
                  same record to review later. */}
              {(() => {
                const e = (request as { timeEntry?: { clockInAt?: string; clockOutAt?: string } }).timeEntry
                const len = shiftLength(e?.clockInAt, e?.clockOutAt ? new Date(e.clockOutAt).getTime() : Date.now())
                return len ? <span className="text-muted-foreground/70">{t("overtime.onShiftOf", { duration: len })}</span> : null
              })()}
              {request.approvalMethod && (
                <span className="inline-flex items-center gap-1">
                  {request.approvalMethod === "SIGNATURE" ? <Pen className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  {request.approvalMethod === "SIGNATURE" ? t("overtime.signed") : t("overtime.remote")}
                </span>
              )}
            </div>
          </div>
        </div>
        {request.approvedBy && (
          <span className="text-xs text-muted-foreground">
            {t("overtime.by", { name: personName(request.approvedBy) })}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * One figure and what it means.
 *
 * Deliberately no euro amount anywhere on this screen: there is no hourly rate
 * in the schema, so a cost would be invented — and on a page about authorising
 * spend, an invented number is worse than a missing one. Hours are real, and
 * carry the same weight for the person deciding.
 */
function StatTile({
  icon: Icon, value, label, tone,
}: {
  icon: typeof Timer; value: string; label: string; tone?: "amber" | "emerald"
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <Icon className={cn(
        "size-4",
        tone === "amber" ? "text-amber-500" : tone === "emerald" ? "text-emerald-500" : "text-muted-foreground",
      )} />
      <p className={cn(
        "mt-2 text-2xl font-semibold tabular-nums",
        tone === "amber" ? "text-amber-600 dark:text-amber-400"
        : tone === "emerald" ? "text-emerald-600 dark:text-emerald-400"
        : "text-foreground",
      )}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  )
}
