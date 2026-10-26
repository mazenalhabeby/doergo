"use client"

import { personName } from "@hbcfield/shared/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { differenceInCalendarDays } from "date-fns"
import Link from "next/link"
import { CalendarOff, MoreHorizontal, Inbox } from "lucide-react"
import { notify } from "@/lib/toast"
import { useTimeFormat } from "@/hooks"
import { employeesApi, type TimeOffStatus } from "@/lib/api"
import type { TimeOffRequest } from "@/lib/api/types/employees"
import { invalidateTimeOff } from "@/lib/query-keys"
import { serverErrorMessage } from "@/lib/server-error"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isAbsence, requestDetail } from "@/lib/requests"
import { RequestKindChip } from "@/components/requests/request-kind"
import { Panel } from "@/components/page/page-kit"
import { RequestTimeOffDialog } from "./request-time-off-dialog"

const STATUS_PILLS: Record<TimeOffStatus, { labelKey: string; hex: string }> = {
  PENDING: { labelKey: "common.pending", hex: "#ca8a04" },
  APPROVED: { labelKey: "common.approved", hex: "#16a34a" },
  REJECTED: { labelKey: "common.rejected", hex: "#dc2626" },
  CANCELED: { labelKey: "common.canceled", hex: "#64748b" },
}

/** What a request costs — its stored working-day count, or the span for rows from before the calendar. */
function getDurationDays(start: string, end: string, workingDays?: number | null): number {
  return workingDays ?? differenceInCalendarDays(new Date(end), new Date(start)) + 1
}

interface TimeOffRequestsProps {
  employeeId: string
  canManage: boolean
  statusFilter: string
  setStatusFilter: (status: string) => void
  timeOffRequests: TimeOffRequest[] | undefined
}

/** A member's requests, filtered by status: what, when, who decided — "Request time off" for the office. */
export function TimeOffRequests({
  employeeId,
  canManage,
  statusFilter,
  setStatusFilter,
  timeOffRequests,
}: TimeOffRequestsProps) {
  const { t } = useTranslation()
  const { formatDate } = useTimeFormat()
  const queryClient = useQueryClient()

  const cancelMutation = useMutation({
    mutationFn: (timeOffId: string) => employeesApi.cancelTimeOff(timeOffId),
    onSuccess: () => {
      invalidateTimeOff(queryClient, employeeId)
      notify.success(t("technicians.timeOffTab.canceledSuccessfully"))
    },
    onError: (error: Error) => {
      notify.error(serverErrorMessage(error, t) || t("technicians.timeOffTab.failedToCancel"))
    },
  })

  return (
    <Panel className="overflow-hidden p-0">
      <div className="px-5 pb-2 pt-[18px] flex items-center gap-2.5">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-shell-accent-soft text-shell-accent">
          <CalendarOff className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("technicians.timeOffTab.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("technicians.timeOffTab.description")}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t("common.filterByStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="PENDING">{t("common.pending")}</SelectItem>
              <SelectItem value="APPROVED">{t("common.approved")}</SelectItem>
              <SelectItem value="REJECTED">{t("common.rejected")}</SelectItem>
              <SelectItem value="CANCELED">{t("common.canceled")}</SelectItem>
            </SelectContent>
          </Select>
          {canManage && <RequestTimeOffDialog employeeId={employeeId} />}
        </div>
      </div>

      {timeOffRequests && timeOffRequests.length > 0 ? (
        <div className="divide-y divide-border">
          {timeOffRequests.map((request) => {
            const pill = STATUS_PILLS[request.status]
            const isPending = request.status === "PENDING"
            return (
              <div key={request.id} className="px-5 py-3.5 hover:bg-accent transition-colors flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {formatDate(request.startDate)}
                      {request.endDate.slice(0, 10) !== request.startDate.slice(0, 10) && (
                        <> – {formatDate(request.endDate)}</>
                      )}
                    </p>
                    <RequestKindChip kind={request.kind} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {isAbsence(request.kind) ? (
                      <span className="flex-shrink-0">
                        {getDurationDays(request.startDate, request.endDate, request.workingDays)}{" "}
                        {t("technicians.timeOffTab.days")}
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
                        <span className="truncate">{personName(request.approvedBy)}</span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] " +
                    "font-medium flex-shrink-0"
                  }
                  style={{ borderColor: `${pill.hex}33`, color: pill.hex, backgroundColor: `${pill.hex}14` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pill.hex }} />
                  {t(pill.labelKey)}
                </span>
                {canManage && isPending && (
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
                          {t("approvals.decideInApprovals")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => cancelMutation.mutate(request.id)}>
                        {t("technicians.timeOffTab.cancelRequest")}
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
          <div
            className={
              "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 " +
              "text-muted-foreground"
            }
          >
            <CalendarOff className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t("technicians.timeOffTab.noRequests")}</p>
        </div>
      )}
    </Panel>
  )
}
