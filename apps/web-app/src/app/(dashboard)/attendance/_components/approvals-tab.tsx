import { useState } from "react"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import { RefreshCw, CheckCircle2, Check, X } from "lucide-react"
import { type TimeEntry } from "@/lib/api"
import { formatDurationMinutes } from "@/lib/utils"
import { UserAvatar } from "@/components/user-avatar"
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
import { FlagReasonBadges, toDate, formatTime } from "./attendance-helpers"
import { countryFromTz } from "@hbcfield/shared/client"
import { useTimeFormat } from "@/hooks"

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
          <Button variant="outline" size="sm" onClick={onRefresh} className="rounded-lg">
            <RefreshCw className="size-4 mr-2" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data?.data?.length ? (
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
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.approvals.location")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.approvals.date")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.clockIn")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.clockOut")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("common.duration")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("common.reason")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((entry: TimeEntry) => (
              <TableRow key={entry.id} className="hover:bg-muted/40 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      firstName={entry.user?.firstName}
                      lastName={entry.user?.lastName}
                      seed={entry.user?.id}
                      size="md"
                    />
                    <p className="font-medium text-foreground">
                      {entry.user?.firstName} {entry.user?.lastName}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{entry.location?.name || t("attendance.approvals.unknown")}</TableCell>
                <TableCell className="text-muted-foreground">
                  <div>{format(toDate(entry.clockInAt), "MMM d, yyyy")}</div>
                  {countryFromTz((entry.timezone ?? entry.location?.timezone), locale) && (
                    <div className="text-xs text-muted-foreground">
                      {countryFromTz((entry.timezone ?? entry.location?.timezone), locale)}
                    </div>
                  )}
                </TableCell>
                <TableCell>{formatTime(entry.clockInAt, hour12, locale, (entry.timezone ?? entry.location?.timezone))}</TableCell>
                <TableCell>{entry.clockOutAt ? formatTime(entry.clockOutAt, hour12, locale, (entry.timezone ?? entry.location?.timezone)) : "-"}</TableCell>
                <TableCell className="font-medium tabular-nums">{formatDurationMinutes(entry.totalMinutes)}</TableCell>
                <TableCell>
                  <FlagReasonBadges reasons={entry.flagReasons} />
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
