"use client"

import { personName } from "@hbcfield/shared/client"
import { format } from "date-fns"
import { CalendarOff, Plus, MoreHorizontal, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { isAbsence, requestDetail } from "@/lib/requests"
import { RequestKindChip } from "@/components/requests/request-kind"
import Link from "next/link"
import { Inbox } from "lucide-react"
import { STATUS_PILLS, getDurationDays } from "./time-off-tab-helpers"
import type { TimeOffTabState } from "./use-time-off-tab"
import type { TimeOffTab } from "./time-off-tab"

/** Part of TimeOffTab's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TimeOffTabTimeOffTab({ vm, canManage }: { vm: TimeOffTabState; canManage: Parameters<typeof TimeOffTab>[0]['canManage'] }) {
  const {
    t,
    statusFilter,
    setStatusFilter,
    createOpen,
    setCreateOpen,
    dateRange,
    setDateRange,
    reason,
    setReason,
    handleCreateSubmit,
    requestMutation,
    timeOffRequests,
    formatDate,
    cancelMutation,
  } = vm
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarOff className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('technicians.timeOffTab.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('technicians.timeOffTab.description')}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t('common.filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="PENDING">{t('common.pending')}</SelectItem>
                <SelectItem value="APPROVED">{t('common.approved')}</SelectItem>
                <SelectItem value="REJECTED">{t('common.rejected')}</SelectItem>
                <SelectItem value="CANCELED">{t('common.canceled')}</SelectItem>
              </SelectContent>
            </Select>
            {canManage && (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('technicians.timeOffTab.requestTimeOff')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('technicians.timeOffTab.requestDialog.title')}</DialogTitle>
                    <DialogDescription>
                      {t('technicians.timeOffTab.requestDialog.description')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>{t('technicians.timeOffTab.requestDialog.dateRangeLabel')}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                              dateRange.to ? (
                                <>
                                  {format(dateRange.from, "MMM d, yyyy")} -{" "}
                                  {format(dateRange.to, "MMM d, yyyy")}
                                </>
                              ) : (
                                format(dateRange.from, "MMM d, yyyy")
                              )
                            ) : (
                              <span className="text-muted-foreground">
                                {t('technicians.timeOffTab.requestDialog.selectDates')}
                              </span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="range"
                            selected={dateRange}
                            onSelect={setDateRange}
                            disabled={{ before: new Date() }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('technicians.timeOffTab.requestDialog.reasonLabel')}</Label>
                      <Textarea
                        placeholder={t('technicians.timeOffTab.requestDialog.reasonPlaceholder')}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      onClick={handleCreateSubmit}
                      disabled={
                        !dateRange?.from ||
                        !dateRange?.to ||
                        requestMutation.isPending
                      }
                    >
                      {requestMutation.isPending
                        ? t('common.submitting')
                        : t('technicians.timeOffTab.requestDialog.submitButton')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
        </div>
      </div>

      {timeOffRequests && timeOffRequests.length > 0 ? (
        <div className="divide-y divide-border/60">
          {timeOffRequests.map((request) => {
            const pill = STATUS_PILLS[request.status]
            const isPending = request.status === "PENDING"
            return (
              <div
                key={request.id}
                className="px-5 py-3.5 hover:bg-accent/40 transition-colors flex items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {formatDate(request.startDate)}
                      {request.endDate.slice(0, 10) !== request.startDate.slice(0, 10) && <> – {formatDate(request.endDate)}</>}
                    </p>
                    <RequestKindChip kind={request.kind} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {isAbsence(request.kind) ? (
                      <span className="flex-shrink-0">
                        {getDurationDays(request.startDate, request.endDate, request.workingDays)}{" "}
                        {t('technicians.timeOffTab.days')}
                      </span>
                    ) : requestDetail(request, t) ? (
                      <span className="flex-shrink-0">{requestDetail(request, t)}</span>
                    ) : null}
                    {request.reason && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="truncate">{request.reason}</span>
                      </>
                    )}
                    {request.approvedBy && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="truncate">
                          {personName(request.approvedBy)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium flex-shrink-0"
                  style={{ borderColor: `${pill.hex}33`, color: pill.hex, backgroundColor: `${pill.hex}14` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pill.hex }} />
                  {t(pill.labelKey)}
                </span>
                {(canManage && isPending) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="flex-shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/* Decided in Approvals — the one place. */}
                      <DropdownMenuItem asChild>
                        <Link href={`/approvals?kind=request&id=${encodeURIComponent(request.id)}`}>
                          <Inbox className="h-4 w-4 mr-2" />
                          {t('approvals.decideInApprovals')}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          cancelMutation.mutate(request.id)
                        }
                      >
                        {t('technicians.timeOffTab.cancelRequest')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-5 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
            <CalendarOff className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t('technicians.timeOffTab.noRequests')}</p>
        </div>
      )}
    </div>
  )
}
