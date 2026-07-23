"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarPlus, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { attendanceApi, employeesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

interface AddAttendanceDialogProps {
  // When provided, the employee is fixed (per-employee Attendance tab).
  // When omitted, the dialog shows an employee picker (management page).
  employeeId?: string
  employeeName?: string
}

type Mode = "single" | "range"

// 0=Sun .. 6=Sat — order Mon-first for display
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function AddAttendanceDialog({
  employeeId,
  employeeName,
}: AddAttendanceDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const fixedEmployee = !!employeeId

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("single")
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("16:00")
  const [breakMinutes, setBreakMinutes] = useState("30")
  const [notes, setNotes] = useState("")

  const { data: locations, isLoading: locationsLoading } = useQuery({
    queryKey: ["companyLocations"],
    queryFn: () => attendanceApi.getLocations(),
    enabled: open,
    staleTime: 5 * 60_000, // sites rarely change — don't refetch on every open
  })

  const { data: employeeList, isLoading: employeesLoading } = useQuery({
    queryKey: ["employeesForAttendance"],
    queryFn: () => employeesApi.list({ status: "active", limit: 100 }),
    enabled: open && !fixedEmployee,
    staleTime: 5 * 60_000,
  })

  const effectiveEmployeeId = fixedEmployee ? employeeId! : selectedEmployeeId

  // Live preview: how many days this will create (weekday-filtered). Purely
  // client-side arithmetic — no request. Dedupe/skips are resolved server-side.
  const previewCount = useMemo(() => {
    if (!startDate) return 0
    if (mode === "single") return 1
    if (!endDate || endDate < startDate || weekdays.length === 0) return 0
    let count = 0
    const cur = new Date(`${startDate}T12:00:00Z`)
    const end = new Date(`${endDate}T12:00:00Z`)
    let guard = 0
    while (cur <= end && guard < 400) {
      if (weekdays.includes(cur.getUTCDay())) count++
      cur.setUTCDate(cur.getUTCDate() + 1)
      guard++
    }
    return count
  }, [mode, startDate, endDate, weekdays])

  const spanDays = useMemo(() => {
    if (mode === "single" || !startDate || !endDate || endDate < startDate) return 0
    return (
      Math.round(
        (new Date(`${endDate}T12:00:00Z`).getTime() -
          new Date(`${startDate}T12:00:00Z`).getTime()) /
          86_400_000
      ) + 1
    )
  }, [mode, startDate, endDate])

  const tooLarge = spanDays > 366

  const mutation = useMutation({
    mutationFn: () =>
      attendanceApi.addManualEntries({
        userId: effectiveEmployeeId,
        locationId,
        startDate,
        endDate: mode === "single" ? startDate : endDate,
        weekdays: mode === "range" ? weekdays : undefined,
        startTime,
        endTime,
        breakMinutes: breakMinutes ? Math.max(0, parseInt(breakMinutes, 10)) : 0,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      // Refresh both the per-employee tab and the org-wide management table.
      queryClient.invalidateQueries({
        queryKey: ["employeeAttendance", effectiveEmployeeId],
      })
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      const created = res?.created ?? 0
      const skipped = res?.skipped ?? 0
      if (created > 0) {
        toast.success(
          skipped > 0
            ? t("technicians.addAttendance.successWithSkipped", { created, skipped })
            : t("technicians.addAttendance.success", { count: created })
        )
        resetAndClose()
      } else {
        toast.info(t("technicians.addAttendance.noneCreated", { skipped }))
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || t("technicians.addAttendance.error"))
    },
  })

  function resetAndClose() {
    setOpen(false)
    setMode("single")
    setSelectedEmployeeId("")
    setLocationId("")
    setStartDate("")
    setEndDate("")
    setWeekdays([1, 2, 3, 4, 5])
    setStartTime("08:00")
    setEndTime("16:00")
    setBreakMinutes("30")
    setNotes("")
  }

  function toggleWeekday(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const weekdayLabels: Record<number, string> = {
    0: t("technicians.addAttendance.weekdays.sun"),
    1: t("technicians.addAttendance.weekdays.mon"),
    2: t("technicians.addAttendance.weekdays.tue"),
    3: t("technicians.addAttendance.weekdays.wed"),
    4: t("technicians.addAttendance.weekdays.thu"),
    5: t("technicians.addAttendance.weekdays.fri"),
    6: t("technicians.addAttendance.weekdays.sat"),
  }

  const canSubmit =
    !!effectiveEmployeeId &&
    !!locationId &&
    !!startDate &&
    (mode === "single" || (!!endDate && weekdays.length > 0)) &&
    !!startTime &&
    !!endTime &&
    previewCount > 0 &&
    !tooLarge &&
    !mutation.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <CalendarPlus className="h-4 w-4" />
          {t("technicians.addAttendance.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("technicians.addAttendance.title")}</DialogTitle>
          <DialogDescription>
            {employeeName
              ? t("technicians.addAttendance.descriptionNamed", { name: employeeName })
              : t("technicians.addAttendance.description")}
          </DialogDescription>
        </DialogHeader>

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
                      {emp.firstName} {emp.lastName}
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
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("technicians.addAttendance.endDate")}</Label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
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

          {/* Break */}
          <div className="space-y-1.5">
            <Label>{t("technicians.addAttendance.breakMinutes")}</Label>
            <Input
              type="number"
              min={0}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
            />
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
