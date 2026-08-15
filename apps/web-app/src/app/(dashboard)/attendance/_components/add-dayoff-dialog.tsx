"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarOff, Loader2 } from "lucide-react"

import { employeesApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const REASON_PRESETS = ["vacation", "sick", "personal", "holiday", "unpaid"] as const

export function AddDayOffDialog() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")

  const { data: employeeList, isLoading: employeesLoading } = useQuery({
    queryKey: ["employeesForAttendance"],
    queryFn: () => employeesApi.list({ status: "active", limit: 100 }),
    enabled: open,
    staleTime: 5 * 60_000,
  })

  const mutation = useMutation({
    mutationFn: () =>
      employeesApi.addTimeOff({
        technicianId: employeeId,
        startDate,
        endDate: endDate || startDate,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgTimeOff"] })
      queryClient.invalidateQueries({ queryKey: ["availability"] })
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      notify.success(t("attendance.addDayOff.success"))
      resetAndClose()
    },
    onError: (err: Error) => {
      notify.error(err.message || t("attendance.addDayOff.error"))
    },
  })

  function resetAndClose() {
    setOpen(false)
    setEmployeeId("")
    setStartDate("")
    setEndDate("")
    setReason("")
  }

  const inverted = !!startDate && !!endDate && endDate < startDate
  const canSubmit = !!employeeId && !!startDate && !inverted && !mutation.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button data-tour="add-dayoff-button" variant="outline" size="sm" className="gap-2">
          <CalendarOff className="h-4 w-4" />
          {t("attendance.addDayOff.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("attendance.addDayOff.title")}</DialogTitle>
          <DialogDescription>{t("attendance.addDayOff.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label>{t("attendance.addDayOff.employee")}</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    employeesLoading
                      ? t("common.loading")
                      : t("attendance.addDayOff.employeePlaceholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(employeeList?.data ?? []).map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("attendance.addDayOff.startDate")}</Label>
              <Input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.addDayOff.endDate")}</Label>
              <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("attendance.addDayOff.datesHint")}</p>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>{t("attendance.addDayOff.reason")}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("attendance.addDayOff.reasonPlaceholder")}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {REASON_PRESETS.map((key) => {
                const label = t(`attendance.addDayOff.reasons.${key}`)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setReason(label)}
                    className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("attendance.addDayOff.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
