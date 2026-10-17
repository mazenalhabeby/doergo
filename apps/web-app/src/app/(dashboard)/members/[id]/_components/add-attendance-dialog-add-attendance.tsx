"use client"

import { personName } from "@hbcfield/shared/client"
import { BreakFields } from "@/components/attendance/break-fields"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WEEKDAY_ORDER } from "./add-attendance-dialog-helpers"
import type { AddAttendanceDialogState } from "./use-add-attendance-dialog"

/** Part of AddAttendanceDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function AddAttendanceDialogAddAttendance({ vm }: { vm: AddAttendanceDialogState }) {
  const {
    fixedEmployee,
    t,
    selectedEmployeeId,
    setSelectedEmployeeId,
    employeesLoading,
    employeeList,
    setMode,
    mode,
    locationId,
    setLocationId,
    locationsLoading,
    locations,
    startDate,
    today,
    setStartDate,
    endDate,
    setEndDate,
    toggleWeekday,
    weekdays,
    weekdayLabels,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    hasBreak,
    setHasBreak,
    breakStart,
    breakEnd,
    breakKind,
    breakReason,
    setBreakStart,
    setBreakEnd,
    setBreakKind,
    setBreakReason,
    breakInvalid,
    notes,
    setNotes,
    tooLarge,
    previewCount,
  } = vm
  return (
    <div className="space-y-4 py-2">
      {/* Employee picker (management page only) */}
      {!fixedEmployee && (
        <div className="space-y-1.5">
          <Label>{t("technicians.addAttendance.employee")}</Label>
          <Select
            value={selectedEmployeeId}
            onValueChange={setSelectedEmployeeId}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  employeesLoading
                    ? t("common.loading")
                    : t("technicians.addAttendance.employeePlaceholder")
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(employeeList?.data ?? []).map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {personName(emp)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            mode === "single"
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:bg-muted"
          }`}
        >
          {t("technicians.addAttendance.modeSingle")}
        </button>
        <button
          type="button"
          onClick={() => setMode("range")}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            mode === "range"
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:bg-muted"
          }`}
        >
          {t("technicians.addAttendance.modeRange")}
        </button>
      </div>

      {/* Location */}
      <div className="space-y-1.5">
        <Label>{t("technicians.addAttendance.location")}</Label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger>
            <SelectValue
              placeholder={
                locationsLoading
                  ? t("common.loading")
                  : t("technicians.addAttendance.locationPlaceholder")
              }
            />
          </SelectTrigger>
          <SelectContent>
            {(locations ?? []).map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dates */}
      {mode === "single" ? (
        <div className="space-y-1.5">
          <Label>{t("technicians.addAttendance.date")}</Label>
          <Input
            type="date"
            value={startDate}
            max={today}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("technicians.addAttendance.startDate")}</Label>
            <Input
              type="date"
              value={startDate}
              max={today}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("technicians.addAttendance.endDate")}</Label>
            <Input
              type="date"
              value={endDate}
              min={startDate || undefined}
              max={today}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Weekdays (range only) */}
      {mode === "range" && (
        <div className="space-y-1.5">
          <Label>{t("technicians.addAttendance.weekdaysLabel")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_ORDER.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleWeekday(day)}
                className={`h-9 w-11 rounded-md border text-xs font-medium transition-colors ${
                  weekdays.includes(day)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:bg-muted"
                }`}
              >
                {weekdayLabels[day]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("technicians.addAttendance.weekdaysHint")}
          </p>
        </div>
      )}

      {/* Times */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("technicians.addAttendance.startTime")}</Label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("technicians.addAttendance.endTime")}</Label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      {/* Break — the same form the edit dialog uses. */}
      <div className="space-y-2 rounded-xl border border-border p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Checkbox checked={hasBreak} onCheckedChange={(v) => setHasBreak(v === true)} />
          {t("technicians.addAttendance.hasBreak", "There was a break")}
        </label>
        {hasBreak && (
          <BreakFields
            // Wall-clock times: this dialog can cover a range of days, and
            // the only thing true of all of them is the time of day.
            mode="time"
            start={breakStart}
            end={breakEnd}
            kind={breakKind}
            reason={breakReason}
            onStart={setBreakStart}
            onEnd={setBreakEnd}
            onKind={setBreakKind}
            onReason={setBreakReason}
            min={startTime || undefined}
            max={endTime || undefined}
            error={
              breakInvalid
                ? t("technicians.addAttendance.breakOutside", "The break must sit inside the shift.")
                : null
            }
            hint={t(
              "technicians.addAttendance.breakHint",
              "Recorded on every day this creates, and editable afterwards like any other break.",
            )}
          />
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>{t("technicians.addAttendance.notes")}</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("technicians.addAttendance.notesPlaceholder")}
        />
      </div>
      {/* Live preview / guardrail */}
      {tooLarge ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("technicians.addAttendance.tooLarge")}
        </p>
      ) : previewCount > 0 && mode === "range" ? (
        <p className="rounded-md bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
          {t("technicians.addAttendance.preview", { count: previewCount })}
        </p>
      ) : null}
    </div>
  )
}
