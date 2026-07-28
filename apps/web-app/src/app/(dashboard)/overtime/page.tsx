"use client"

import { PlanGate } from "@/components/plan-gate"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
import { notify } from "@/lib/toast"
import { format, formatDistanceToNow } from "date-fns"
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Timer,
  MapPin,
  User,
  Pen,
} from "lucide-react"

import {
  overtimeApi,
  type OvertimeRequest,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

const STATUS_BADGES: Record<string, { labelKey: string; className: string; icon: any }> = {
  PENDING_TECHNICIAN: { labelKey: "overtime.badges.awaitingEmployee", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Clock },
  PENDING_APPROVAL: { labelKey: "overtime.badges.needsApproval", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: AlertTriangle },
  APPROVED: { labelKey: "overtime.badges.active", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  REJECTED: { labelKey: "overtime.badges.rejected", className: "bg-red-500/15 text-red-600 dark:text-red-400", icon: XCircle },
  EXPIRED_NO_RESPONSE: { labelKey: "overtime.badges.expired", className: "bg-muted text-muted-foreground", icon: Clock },
  EXPIRED_NO_APPROVAL: { labelKey: "overtime.badges.expired", className: "bg-muted text-muted-foreground", icon: Clock },
  COMPLETED: { labelKey: "overtime.badges.completed", className: "bg-muted text-foreground", icon: CheckCircle2 },
  CANCELED: { labelKey: "overtime.badges.declined", className: "bg-muted text-muted-foreground", icon: XCircle },
}

const DURATION_OPTIONS = [
  { labelKey: "overtime.durations.d30min", value: 30 },
  { labelKey: "overtime.durations.d1hour", value: 60 },
  { labelKey: "overtime.durations.d1_5hours", value: 90 },
  { labelKey: "overtime.durations.d2hours", value: 120 },
  { labelKey: "overtime.durations.d3hours", value: 180 },
  { labelKey: "overtime.durations.d4hours", value: 240 },
]

export default function OvertimePage() {
  return (
    <PlanGate feature="overtime">
      <OvertimePageInner />
    </PlanGate>
  )
}

function OvertimePageInner() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState("pending")

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<OvertimeRequest | null>(null)
  const [approveDuration, setApproveDuration] = useState("120")
  const [approveNotes, setApproveNotes] = useState("")

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<OvertimeRequest | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  // History filters
  const [historyStatus, setHistoryStatus] = useState("all")
  const [historyPage, setHistoryPage] = useState(1)

  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ["overtime-pending"],
    queryFn: () => overtimeApi.getPendingApprovals(),
  })

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["overtime-history", historyStatus, historyPage],
    queryFn: () => overtimeApi.getHistory({
      status: historyStatus === "all" ? undefined : historyStatus,
      page: historyPage,
      limit: 15,
    }),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { maxDurationMinutes: number; notes?: string } }) =>
      overtimeApi.approve(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overtime-pending"] })
      queryClient.invalidateQueries({ queryKey: ["overtime-history"] })
      setApproveTarget(null)
      notify.success(t("overtime.toastApproved"))
    },
    onError: (err: Error) => notify.error(err.message || t("overtime.toastFailedApprove")),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { reason: string } }) =>
      overtimeApi.reject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overtime-pending"] })
      queryClient.invalidateQueries({ queryKey: ["overtime-history"] })
      setRejectTarget(null)
      notify.success(t("overtime.toastRejected"))
    },
    onError: (err: Error) => notify.error(err.message || t("overtime.toastFailedReject")),
  })

  const pending = pendingData || []
  const history = historyData?.data || []
  const historyMeta = historyData?.meta

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
              onClick={() => { refetchPending(); refetchHistory(); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="pending" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              {t("overtime.tabsPending")}
              {pending.length > 0 && (
                <Badge className="bg-blue-600 text-white text-xs ml-1">{pending.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Clock className="h-4 w-4" />
              {t("overtime.tabsHistory")}
            </TabsTrigger>
          </TabsList>

          {/* PENDING TAB */}
          <TabsContent value="pending">
            {pendingLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
              </div>
            ) : pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-emerald-50 p-4 mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{t("overtime.pendingEmpty")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("overtime.pendingEmptyHint")}</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {pending.map((req) => (
                  <OvertimeCard
                    key={req.id}
                    request={req}
                    onApprove={() => { setApproveTarget(req); setApproveDuration("120"); setApproveNotes(""); }}
                    onReject={() => { setRejectTarget(req); setRejectReason(""); }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history">
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
                  <HistoryCard key={req.id} request={req} />
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
          </TabsContent>
        </Tabs>

        {/* Approve Dialog */}
        <Dialog open={!!approveTarget} onOpenChange={(open) => { if (!open) setApproveTarget(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("overtime.approveTitle")}</DialogTitle>
              <DialogDescription>
                {t("overtime.approveDescription", {
                  name: `${approveTarget?.technician?.firstName ?? ""} ${approveTarget?.technician?.lastName ?? ""}`.trim(),
                  location: approveTarget?.location?.name ?? "",
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {approveTarget?.technicianReason && (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground mb-1">{t("overtime.employeeReason")}</p>
                  <p className="text-sm text-foreground">{approveTarget.technicianReason}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("overtime.durationLabel")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setApproveDuration(opt.value.toString())}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        approveDuration === opt.value.toString()
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-card text-foreground border-border hover:border-border"
                      }`}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("overtime.notesLabel")}</Label>
                <Input
                  placeholder={t("overtime.notesPlaceholder")}
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveTarget(null)}>{t("common.cancel")}</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => approveTarget && approveMutation.mutate({
                  id: approveTarget.id,
                  data: { maxDurationMinutes: parseInt(approveDuration), notes: approveNotes.trim() || undefined },
                })}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? t("common.approving") : t("overtime.approve")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("overtime.rejectTitle")}</DialogTitle>
              <DialogDescription>
                {t("overtime.rejectDescription", {
                  name: `${rejectTarget?.technician?.firstName ?? ""} ${rejectTarget?.technician?.lastName ?? ""}`.trim(),
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t("overtime.reasonLabel")}</Label>
                <Input
                  placeholder={t("overtime.reasonPlaceholder")}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectTarget(null)}>{t("common.cancel")}</Button>
              <Button
                variant="destructive"
                onClick={() => rejectTarget && rejectMutation.mutate({
                  id: rejectTarget.id,
                  data: { reason: rejectReason.trim() },
                })}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
              >
                {rejectMutation.isPending ? t("common.rejecting") : t("overtime.rejectAndClockOut")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

// ============================================================================
// PENDING OVERTIME CARD
// ============================================================================

function OvertimeCard({
  request,
  onApprove,
  onReject,
}: {
  request: OvertimeRequest
  onApprove: () => void
  onReject: () => void
}) {
  const { t } = useTranslation()
  const badge = STATUS_BADGES[request.status] || STATUS_BADGES.PENDING_APPROVAL

  return (
    <div className="rounded-xl border border-blue-200 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Timer className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground">
                {request.technician?.firstName} {request.technician?.lastName}
              </h3>
              <Badge className={badge.className}>{t(badge!.labelKey)}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {request.location?.name}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
              </span>
            </div>
            {request.technicianReason && (
              <p className="mt-2 text-sm text-muted-foreground bg-muted rounded-md px-3 py-1.5">
                "{request.technicianReason}"
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={onReject}>
            <XCircle className="h-4 w-4 mr-1" />
            {t("overtime.reject")}
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onApprove}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {t("overtime.approve")}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// HISTORY CARD
// ============================================================================

function HistoryCard({ request }: { request: OvertimeRequest }) {
  const { t } = useTranslation()
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
                {request.technician?.firstName} {request.technician?.lastName}
              </span>
              <Badge variant="outline" className={`text-xs ${badge!.className}`}>{t(badge!.labelKey)}</Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{request.location?.name}</span>
              <span>{format(new Date(request.createdAt), `MMM d, ${timeToken}`)}</span>
              {request.overtimeMinutes && (
                <span className="font-medium text-muted-foreground">{t("overtime.minOvertime", { count: request.overtimeMinutes })}</span>
              )}
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
            {t("overtime.by", { name: `${request.approvedBy.firstName} ${request.approvedBy.lastName}` })}
          </span>
        )}
      </div>
    </div>
  )
}
