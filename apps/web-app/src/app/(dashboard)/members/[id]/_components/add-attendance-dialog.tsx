"use client"

import { CalendarPlus, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useAddAttendanceDialog, type AddAttendanceDialogProps } from "./use-add-attendance-dialog"
import { AddAttendanceDialogAddAttendance } from "./add-attendance-dialog-add-attendance"

export function AddAttendanceDialog({
  employeeId,
  employeeName,
  prefill,
  trigger,
  onAdded,
}: AddAttendanceDialogProps) {
  const vm = useAddAttendanceDialog({ employeeId, employeeName, prefill, trigger, onAdded })
  const {
    t,
    fixedEmployee,
    open,
    mode,
    setMode,
    selectedEmployeeId,
    setSelectedEmployeeId,
    locationId,
    setLocationId,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    today,
    weekdays,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    hasBreak,
    setHasBreak,
    breakStart,
    setBreakStart,
    breakEnd,
    setBreakEnd,
    breakKind,
    setBreakKind,
    breakReason,
    setBreakReason,
    notes,
    setNotes,
    locations,
    locationsLoading,
    employeeList,
    employeesLoading,
    previewCount,
    tooLarge,
    mutation,
    openWith,
    resetAndClose,
    toggleWeekday,
    weekdayLabels,
    breakInvalid,
    canSubmit,
  } = vm

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? openWith() : resetAndClose())}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button data-tour="add-attendance-button" size="sm" className="gap-2">
            <CalendarPlus className="h-4 w-4" />
            {t("technicians.addAttendance.button")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("technicians.addAttendance.title")}</DialogTitle>
          <DialogDescription>
            {employeeName
              ? t("technicians.addAttendance.descriptionNamed", { name: employeeName })
              : t("technicians.addAttendance.description")}
          </DialogDescription>
        </DialogHeader>

        <AddAttendanceDialogAddAttendance vm={vm} />

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "range" && previewCount > 0 && !tooLarge
              ? t("technicians.addAttendance.submitCount", { count: previewCount })
              : t("technicians.addAttendance.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
