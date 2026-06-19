import { useState } from "react"
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
  const [rejectTarget, setRejectTarget] = useState<TimeEntry | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")

  const closeReject = () => {
    setRejectTarget(null)
    setRejectionReason("")
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-border/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Pending Approvals</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Review and approve time entries that require manager approval
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} className="rounded-lg">
            <RefreshCw className="size-4 mr-2" />
            Refresh
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
          <h3 className="text-base font-medium text-foreground">All caught up!</h3>
          <p className="text-sm text-muted-foreground mt-1">No pending approvals at this time</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-semibold text-muted-foreground">Worker</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Location</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Date</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Clock In</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Clock Out</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Duration</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Reason</TableHead>
              <TableHead className="font-semibold text-muted-foreground text-right">Actions</TableHead>
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
                <TableCell className="text-muted-foreground">{entry.location?.name || "Unknown"}</TableCell>
                <TableCell className="text-muted-foreground">{format(toDate(entry.clockInAt), "MMM d, yyyy")}</TableCell>
                <TableCell>{formatTime(entry.clockInAt)}</TableCell>
                <TableCell>{entry.clockOutAt ? formatTime(entry.clockOutAt) : "-"}</TableCell>
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
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRejectTarget(entry)}
                      disabled={rejecting}
                      className="rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-4 mr-1" />
                      Reject
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
            <DialogTitle>Reject time entry</DialogTitle>
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
            <Label>Reason <span className="text-muted-foreground/60">(optional)</span></Label>
            <Textarea
              placeholder="Why is this entry being rejected?"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReject}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectTarget) onReject(rejectTarget.id, rejectionReason.trim())
                closeReject()
              }}
              disabled={rejecting}
            >
              {rejecting ? "Rejecting…" : "Reject entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
