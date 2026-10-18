"use client"

import { todayKey } from "@hbcfield/shared/client"
import { useMemo, useState, type ReactNode } from "react"
import { breakFitsShift, type BreakKind } from "@/components/attendance/break-fields"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { attendanceApi, employeesApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"

export interface AddAttendanceDialogProps {
  // When provided, the employee is fixed (per-employee Attendance tab).
  // When omitted, the dialog shows an employee picker (management page).
  employeeId?: string
  employeeName?: string
  /** Open filled in — "They were here" on a missed shift fills the workspace, the day and the hours. */
  prefill?: { locationId: string; date: string; startTime: string; endTime: string }
  /** A different button to open it with. */
  trigger?: ReactNode
  /** After hours were added (the caller refreshes what depended on them). */
  onAdded?: () => void
}

type Mode = "single" | "range"

/** AddAttendanceDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useAddAttendanceDialog({
  employeeId,
  employeeName,
  prefill,
  trigger,
  onAdded,
}: Pick<AddAttendanceDialogProps, 'employeeId' | 'employeeName' | 'prefill' | 'trigger' | 'onAdded'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const fixedEmployee = !!employeeId

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("single")
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  // A shift is added once it has happened; the server refuses one that ends later than now.
  const today = useMemo(() => todayKey(), [])
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("16:00")
  /*
    The same break the edit dialog takes — a start, an end, a type and a reason —
    entered as wall-clock times because this dialog can cover many days at once.

    It was a number of minutes, which is a different form for the same thing and,
    until this pass, a different RECORD: the number never became a break, so it
    was invisible on the screen that lists them.
  */
  const [hasBreak, setHasBreak] = useState(true)
  const [breakStart, setBreakStart] = useState("12:00")
  const [breakEnd, setBreakEnd] = useState("12:30")
  const [breakKind, setBreakKind] = useState<BreakKind>("LUNCH")
  const [breakReason, setBreakReason] = useState("")
  const [notes, setNotes] = useState("")

  const { data: locations, isLoading: locationsLoading } = useQuery({
    queryKey: keys.attendance.locationsPicker(),
    queryFn: () => attendanceApi.getLocations(),
    enabled: open,
    staleTime: 5 * 60_000, // sites rarely change — don't refetch on every open
  })

  const { data: employeeList, isLoading: employeesLoading } = useQuery({
    queryKey: keys.attendance.employeesPicker(),
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
        ...(hasBreak
          ? {
              breakStart,
              breakEnd,
              breakType: breakKind,
              breakReason: breakReason.trim() || undefined,
            }
          : {}),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      // Refresh the member-detail Attendance tab (its query key is
      // ["memberAttendance", id]) AND the org-wide management table (D1). The old
      // ["employeeAttendance", …] key was a dead leftover from the retired page.
      queryClient.invalidateQueries({
        queryKey: keys.memberRecord.attendance(effectiveEmployeeId),
      })
      queryClient.invalidateQueries({ queryKey: keys.attendance.list() })
      const created = res?.created ?? 0
      const skipped = res?.skipped ?? 0
      if (created > 0) {
        toast.success(
          skipped > 0
            ? t("technicians.addAttendance.successWithSkipped", { created, skipped })
            : t("technicians.addAttendance.success", { count: created })
        )
        onAdded?.()
        resetAndClose()
      } else {
        toast.info(t("technicians.addAttendance.noneCreated", { skipped }))
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || t("technicians.addAttendance.error"))
    },
  })

  function openWith() {
    if (prefill) {
      setMode("single")
      setLocationId(prefill.locationId)
      setStartDate(prefill.date)
      setStartTime(prefill.startTime)
      setEndTime(prefill.endTime)
      // The rest the shift had is not known here: the office adds one if there was.
      setHasBreak(false)
    }
    setOpen(true)
  }

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
    setHasBreak(true)
    setBreakStart("12:00")
    setBreakEnd("12:30")
    setBreakKind("LUNCH")
    setBreakReason("")
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

  /*
    The break has to sit inside the shift, and the right way round.

    Same rule as the edit dialog, from the same function — the server checks it a
    third time. This only spares the round trip and says which field is wrong
    while somebody is still looking at it.
  */
  const breakInvalid =
    hasBreak && !!startTime && !!endTime && !breakFitsShift(breakStart, breakEnd, startTime, endTime)
  const breakNeedsReason = hasBreak && breakReason.trim().length < 3

  const canSubmit =
    !!effectiveEmployeeId &&
    !!locationId &&
    !!startDate &&
    (mode === "single" || (!!endDate && weekdays.length > 0)) &&
    !!startTime &&
    !!endTime &&
    previewCount > 0 &&
    !tooLarge &&
    !breakInvalid &&
    !breakNeedsReason &&
    !mutation.isPending

  return {
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
  }
}

/** What AddAttendanceDialog and its sections read. */
export type AddAttendanceDialogState = ReturnType<typeof useAddAttendanceDialog>
