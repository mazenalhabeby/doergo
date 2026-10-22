"use client"

import { personName } from "@hbcfield/shared/client"
import { BreakFields } from "@/components/attendance/break-fields"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { BreakKind } from "@/components/attendance/break-fields"
import { useTranslation } from "react-i18next"
import { Segmented } from "@/components/ui/segmented"
import { attendanceApi, employeesApi } from "@/lib/api"

// 0=Sun .. 6=Sat — order Mon-first for display
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

type Mode = "single" | "range"

interface AddAttendanceFormProps {
  /** The member is given (their own Attendance tab) — no picker. */
  fixedEmployee: boolean
  selectedEmployeeId: string
  setSelectedEmployeeId: (id: string) => void
  employeeList: Awaited<ReturnType<typeof employeesApi.list>> | undefined
  employeesLoading: boolean
  mode: Mode
  setMode: (mode: Mode) => void
  locationId: string
  setLocationId: (id: string) => void
  locations: Awaited<ReturnType<typeof attendanceApi.getLocations>> | undefined
  locationsLoading: boolean
  startDate: string
  setStartDate: (date: string) => void
  endDate: string
  setEndDate: (date: string) => void
  /** The latest day a shift may be added for. */
  today: string
  weekdays: number[]
  toggleWeekday: (day: number) => void
  startTime: string
  setStartTime: (time: string) => void
  endTime: string
  setEndTime: (time: string) => void
  hasBreak: boolean
  setHasBreak: (has: boolean) => void
  breakStart: string
  setBreakStart: (time: string) => void
  breakEnd: string
  setBreakEnd: (time: string) => void
  breakKind: BreakKind
  setBreakKind: (kind: BreakKind) => void
  breakReason: string
  setBreakReason: (reason: string) => void
  breakInvalid: boolean
  notes: string
  setNotes: (notes: string) => void
  /** The range spans more than a year. */
  tooLarge: boolean
  /** How many days this creates. */
  previewCount: number
}

/** The add-attendance form: who, single day or range, where, when, the break, notes, and what it will create. */
export function AddAttendanceForm({
  fixedEmployee,
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
}: AddAttendanceFormProps) {
  const { t } = useTranslation()
  const weekdayLabels: Record<number, string> = {
    0: t("technicians.addAttendance.weekdays.sun"),
    1: t("technicians.addAttendance.weekdays.mon"),
    2: t("technicians.addAttendance.weekdays.tue"),
    3: t("technicians.addAttendance.weekdays.wed"),
    4: t("technicians.addAttendance.weekdays.thu"),
    5: t("technicians.addAttendance.weekdays.fri"),
    6: t("technicians.addAttendance.weekdays.sat"),
  }
  return (
    <div className="space-y-4 py-2">
      {/* Employee picker (management page only) */}
      {!fixedEmployee && (
        <div className="space-y-1.5">
          <Label>{t("technicians.addAttendance.employee")}</Label>
          <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  employeesLoading ? t("common.loading") : t("technicians.addAttendance.employeePlaceholder")
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
      <Segmented
        ariaLabel={t("technicians.addAttendance.modeSingle") + " / " + t("technicians.addAttendance.modeRange")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "single", label: t("technicians.addAttendance.modeSingle") },
          { value: "range", label: t("technicians.addAttendance.modeRange") },
        ]}
      />

      {/* Location */}
      <div className="space-y-1.5">
        <Label>{t("technicians.addAttendance.location")}</Label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger>
            <SelectValue
              placeholder={locationsLoading ? t("common.loading") : t("technicians.addAttendance.locationPlaceholder")}
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
          <Input type="date" value={startDate} max={today} onChange={(e) => setStartDate(e.target.value)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("technicians.addAttendance.startDate")}</Label>
            <Input type="date" value={startDate} max={today} onChange={(e) => setStartDate(e.target.value)} />
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
          <p className="text-xs text-muted-foreground">{t("technicians.addAttendance.weekdaysHint")}</p>
        </div>
      )}

      {/* Times */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("technicians.addAttendance.startTime")}</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("technicians.addAttendance.endTime")}</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
              breakInvalid ? t("technicians.addAttendance.breakOutside", "The break must sit inside the shift.") : null
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
