"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Plus, CalendarDays } from "lucide-react"
import { notify } from "@/lib/toast"
import { employeesApi } from "@/lib/api"
import { invalidateTimeOff } from "@/lib/query-keys"
import { serverErrorMessage } from "@/lib/server-error"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** "Request time off" for a member: a date range and a reason, sent on their behalf. */
export function RequestTimeOffDialog({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  // Create form state
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [reason, setReason] = useState("")

  const requestMutation = useMutation({
    mutationFn: (data: { startDate: string; endDate: string; reason?: string }) =>
      employeesApi.requestTimeOff(employeeId, data),
    onSuccess: () => {
      invalidateTimeOff(queryClient, employeeId)
      setCreateOpen(false)
      setDateRange(undefined)
      setReason("")
      notify.success(t("technicians.timeOffTab.submittedSuccessfully"))
    },
    onError: (error: Error) => {
      notify.error(serverErrorMessage(error, t) || t("technicians.timeOffTab.failedToSubmit"))
    },
  })

  const handleCreateSubmit = () => {
    if (!dateRange?.from || !dateRange?.to) {
      notify.error(t("validation.pleaseSelectDateRange"))
      return
    }
    requestMutation.mutate({
      startDate: format(dateRange.from, "yyyy-MM-dd"),
      endDate: format(dateRange.to, "yyyy-MM-dd"),
      reason: reason || undefined,
    })
  }

  return (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t("technicians.timeOffTab.requestTimeOff")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("technicians.timeOffTab.requestDialog.title")}</DialogTitle>
          <DialogDescription>{t("technicians.timeOffTab.requestDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("technicians.timeOffTab.requestDialog.dateRangeLabel")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "MMM d, yyyy")
                    )
                  ) : (
                    <span className="text-muted-foreground">
                      {t("technicians.timeOffTab.requestDialog.selectDates")}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="range" selected={dateRange} onSelect={setDateRange} disabled={{ before: new Date() }} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label>{t("technicians.timeOffTab.requestDialog.reasonLabel")}</Label>
            <Textarea
              placeholder={t("technicians.timeOffTab.requestDialog.reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleCreateSubmit}
            disabled={!dateRange?.from || !dateRange?.to || requestMutation.isPending}
          >
            {requestMutation.isPending
              ? t("common.submitting")
              : t("technicians.timeOffTab.requestDialog.submitButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
