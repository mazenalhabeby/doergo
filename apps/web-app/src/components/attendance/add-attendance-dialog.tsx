"use client"

import { CalendarPlus, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

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
import { AddAttendanceForm } from "./add-attendance-form"

/** Add hours by hand — one day or a range of weekdays — for a member, or for one picked here. */
export function AddAttendanceDialog({ employeeId, employeeName, prefill, trigger, onAdded }: AddAttendanceDialogProps) {
  const { t } = useTranslation()
  const {
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
    breakInvalid,
    canSubmit,
  } = useAddAttendanceDialog({ employeeId, prefill, onAdded })

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? openWith() : resetAndClose())}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button data-tour="add-attendance-button" size="pill" className="gap-2">
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

        <AddAttendanceForm
          fixedEmployee={fixedEmployee}
          selectedEmployeeId={selectedEmployeeId}
          setSelectedEmployeeId={setSelectedEmployeeId}
          employeeList={employeeList}
          employeesLoading={employeesLoading}
          mode={mode}
          setMode={setMode}
          locationId={locationId}
          setLocationId={setLocationId}
          locations={locations}
          locationsLoading={locationsLoading}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          today={today}
          weekdays={weekdays}
          toggleWeekday={toggleWeekday}
          startTime={startTime}
          setStartTime={setStartTime}
          endTime={endTime}
          setEndTime={setEndTime}
          hasBreak={hasBreak}
          setHasBreak={setHasBreak}
          breakStart={breakStart}
          setBreakStart={setBreakStart}
          breakEnd={breakEnd}
          setBreakEnd={setBreakEnd}
          breakKind={breakKind}
          setBreakKind={setBreakKind}
          breakReason={breakReason}
          setBreakReason={setBreakReason}
          breakInvalid={breakInvalid}
          notes={notes}
          setNotes={setNotes}
          tooLarge={tooLarge}
          previewCount={previewCount}
        />

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
