import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import { RefreshCw, CheckCircle2, Check, X } from "lucide-react"
import { type TimeEntry } from "@/lib/api"
import { formatDurationMinutes } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toDate, StatusBadge, WorkerCell, ClockCell, ApprovalCell, NoteCell } from "./attendance-helpers"
import { useTimeFormat } from "@/hooks"
import { workedMinutes } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { recordedOffline } from "@/lib/attendance-status"

interface ApprovalsTabProps {
  loading: boolean
  data?: { data?: TimeEntry[] }
  onRefresh: () => void
  onApprove: (entryId: string) => void
  onReject: (entryId: string, reason: string) => void
  approving: boolean
  rejecting: boolean
}

export function ApprovalsTab({ loading, data, onRefresh, onApprove, onReject, approving, rejecting }: ApprovalsTabProps) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()
  const [rejectTarget, setRejectTarget] = useState<TimeEntry | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")

  /*
    Only the shifts recorded without signal: they arrived late, carry the
    evidence of the tap, and are the ones worth reading with that in mind.
  */
  const [onlyOffline, setOnlyOffline] = useState(false)
  const all = useMemo(() => data?.data ?? [], [data?.data])
  const offlineCount = useMemo(() => all.filter(recordedOffline).length, [all])
  const shown = onlyOffline ? all.filter(recordedOffline) : all

  const closeReject = () => {
    setRejectTarget(null)
    setRejectionReason("")
  }

  return (
    <div data-tour="approvals-content" className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-border/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("attendance.approvals.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("attendance.approvals.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {offlineCount > 0 && (
              <div className="flex items-center gap-1.5" role="group" aria-label={t("attendance.approvals.filterLabel")}>
                {([
                  [false, all.length, t("attendance.approvals.filterAll")],
                  [true, offlineCount, t("attendance.approvals.filterOffline")],
                ] as const).map(([value, count, label]) => (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={onlyOffline === value}
                    onClick={() => setOnlyOffline(value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                      onlyOffline === value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border/80 bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="font-semibold tabular-nums">{count}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={onRefresh} className="rounded-lg">
              <RefreshCw className="size-4 mr-2" />
              {t("common.refresh")}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !all.length ? (
        <div className="p-14 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="size-6 text-emerald-500" />
          </div>
          <h3 className="text-base font-medium text-foreground">{t("attendance.approvals.allCaughtUp")}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t("attendance.approvals.noneDesc")}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.worker")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("common.status")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.clockIn")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.clockOut")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("common.duration")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.approval")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.notes")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((entry: TimeEntry) => (
              <TableRow key={entry.id} className="hover:bg-muted/40 transition-colors">
                <TableCell>
                  <WorkerCell entry={entry} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={entry.status} />
                </TableCell>
                <TableCell>
                  <ClockCell at={entry.clockInAt} tz={entry.timezone ?? entry.location?.timezone} hour12={hour12} locale={locale} />
                </TableCell>
                <TableCell>
                  <ClockCell at={entry.clockOutAt} tz={entry.timezone ?? entry.location?.timezone} hour12={hour12} locale={locale} />
                </TableCell>
                <TableCell className="font-medium tabular-nums">{formatDurationMinutes(workedMinutes(entry))}</TableCell>
                <TableCell>
                  <ApprovalCell entry={entry} />
                </TableCell>
                <TableCell>
                  <NoteCell note={entry.notes} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => onApprove(entry.id)}
                      disabled={approving}
                      className="rounded-lg bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                      <Check className="size-4 mr-1" />
                      {t("attendance.approvals.approve")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRejectTarget(entry)}
                      disabled={rejecting}
                      className="rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-4 mr-1" />
                      {t("attendance.approvals.reject")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Reject dialog — matches the app's Time-Off reject flow */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) closeReject() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("attendance.approvals.rejectTitle")}</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  {rejectTarget.user?.firstName} {rejectTarget.user?.lastName} ·{" "}
                  {format(toDate(rejectTarget.clockInAt), "MMM d, yyyy")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>{t("common.reason")} <span className="text-muted-foreground/60">({t("common.optional")})</span></Label>
            <Textarea
              placeholder={t("attendance.approvals.rejectPlaceholder")}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReject}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectTarget) onReject(rejectTarget.id, rejectionReason.trim())
                closeReject()
              }}
              disabled={rejecting}
            >
              {rejecting ? t("common.rejecting") : t("attendance.approvals.rejectEntry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
