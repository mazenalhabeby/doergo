"use client"

import { useMemo, useState } from "react"
import { type BreakKind } from "@/components/attendance/break-fields"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { attendanceApi, type TimeEntry } from "@/lib/api"
import { notify } from "@/lib/toast"
import { utcToZonedInput, zonedInputToUtc } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { keys } from "@/lib/query-keys"

/** EditEntryDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useEditEntryDialog({
  entry,
  canEdit = true,
  canDelete = false,
}: Pick<{
  entry: TimeEntry
  /** canReconcileAttendance — times, note, breaks. */
  canEdit?: boolean
  /** canDeleteAttendance — the Remove button. */
  canDelete?: boolean
}, 'entry' | 'canEdit' | 'canDelete'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // The zone the entry's times are shown in — same as the table (per-entry GPS
  // zone, then the space zone). Falls back to the org zone, then the browser's.
  const initialTz =
    entry.timezone ||
    entry.location?.timezone ||
    user?.organizationTimezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone

  const [open, setOpen] = useState(false)
  const [tz, setTz] = useState(initialTz)
  // Inputs hold wall-clock strings AS SEEN in `tz` (not browser-local).
  const [clockIn, setClockIn] = useState(() => utcToZonedInput(entry.clockInAt, initialTz))
  const [clockOut, setClockOut] = useState(() => utcToZonedInput(entry.clockOutAt, initialTz))
  const [notes, setNotes] = useState(entry.notes ?? "")
  const [reason, setReason] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addingBreak, setAddingBreak] = useState(false)
  const [breakStart, setBreakStart] = useState("")
  const [breakEnd, setBreakEnd] = useState("")
  const [breakType, setBreakType] = useState<BreakKind>("SHORT")
  const [breakReason, setBreakReason] = useState("")
  /*
    Breaks wait for Save; they are not written the moment you add one.

    Two reasons, both learned the hard way. The server validates a break against
    the shift's CURRENT times, so adding one while the clock times are still
    unsaved is checked against the old shift and refused — you had to save the
    times, reopen, then add the break. And a dialog with its own Save inside
    another Save asks somebody to guess which button commits what.

    So the form queues, and one Save applies the edits first and then the breaks,
    in that order, against times the server has already accepted.
  */
  /*
    Breaks marked for removal, held until Save like the additions are.

    Mixing an immediate delete with a queued add is the inconsistency that made
    this dialog confusing in the first place — one button commits everything or
    the buttons stop meaning anything.
  */
  const [removingBreaks, setRemovingBreaks] = useState<string[]>([])
  const [pendingBreaks, setPendingBreaks] = useState<
    { type: "SHORT" | "LUNCH" | "OTHER"; startedAt: string; endedAt: string; reason: string; label: string }[]
  >([])

  /**
   * The break currently typed into the form, if it is complete.
   *
   * "Add to list" exists for entering SEVERAL breaks, but filling the form and
   * pressing Save is what somebody adding ONE will do — and losing it there,
   * silently, because of an extra click they had no reason to expect, is the
   * worst possible outcome for a form about somebody's paid hours.
   *
   * So a completed form counts: towards the total shown in the header, and in
   * what Save writes. Filling it in IS the intent; the extra button is a
   * convenience for the second one, not a toll on the first.
   */
  const typedBreak = useMemo(() => {
    if (!breakStart || !breakEnd || breakReason.trim().length < 3) return null
    const startedAt = zonedInputToUtc(breakStart, tz)
    const endedAt = zonedInputToUtc(breakEnd, tz)
    if (new Date(endedAt) <= new Date(startedAt)) return null
    return {
      type: breakType,
      startedAt,
      endedAt,
      reason: breakReason.trim(),
      label: `${breakStart.slice(11)}–${breakEnd.slice(11)}`,
    }
  }, [breakStart, breakEnd, breakType, breakReason, tz])

  /** The breaks already recorded on this shift — so the dialog shows what exists. */
  const { data: existingBreaks = [] } = useQuery({
    queryKey: keys.attendance.entryBreaks(entry.id),
    queryFn: () => attendanceApi.entryBreaks(entry.id),
    enabled: open,
  })

  // Changing the zone keeps the real instant fixed and re-renders the wall clock
  // (e.g. 23:44 Berlin → 17:44 New York). So correcting a mis-zoned old row just
  // relabels it; the admin only retypes digits if the time itself was wrong.
  function changeTz(nextTz: string) {
    setClockIn((cur) => (cur ? utcToZonedInput(zonedInputToUtc(cur, tz), nextTz) : cur))
    setClockOut((cur) => (cur ? utcToZonedInput(zonedInputToUtc(cur, tz), nextTz) : cur))
    setTz(nextTz)
  }

  // Reset local state to the entry's current values whenever the dialog opens.
  function openWith(next: boolean) {
    if (next) {
      setTz(initialTz)
      setClockIn(utcToZonedInput(entry.clockInAt, initialTz))
      setClockOut(utcToZonedInput(entry.clockOutAt, initialTz))
      setNotes(entry.notes ?? "")
      setReason("")
      setConfirmDelete(false)
      setPendingBreaks([])
      setRemovingBreaks([])
      setAddingBreak(false)
    }
    setOpen(next)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // Times first. A queued break is validated against the shift, so it has to
      // be checked against the times the server has just accepted — not the ones
      // it held when the dialog opened.
      await attendanceApi.editEntry(entry.id, {
        clockInAt: clockIn ? zonedInputToUtc(clockIn, tz) : undefined,
        clockOutAt: clockOut ? zonedInputToUtc(clockOut, tz) : undefined,
        notes: notes.trim() || undefined,
        timezone: tz || undefined,
        reason: reason.trim(),
      })
      // Sequentially, not in parallel: each is checked for overlap against the
      // ones already recorded, and two arriving at once can both pass a check
      // neither would pass afterwards.
      /*
        Removals BEFORE additions.

        Correcting a break is remove-then-add, and the new one usually occupies
        the slot the old one held. Adding first would collide with a break that
        is about to disappear.
      */
      for (const id of removingBreaks) {
        await attendanceApi.removeBreak(id)
      }
      // The queue, plus a completed form the person never pressed "Add another"
      // on — see `typedBreak`.
      for (const b of [...pendingBreaks, ...(typedBreak ? [typedBreak] : [])]) {
        await attendanceApi.addBreak(entry.id, {
          type: b.type, startedAt: b.startedAt, endedAt: b.endedAt, reason: b.reason,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.attendance.list() })
      queryClient.invalidateQueries({ queryKey: keys.attendance.approvals() })
      queryClient.invalidateQueries({ queryKey: keys.attendance.entryBreaks(entry.id) })
      // The Breaks tab (was `["breaks"]`, which no query reads).
      queryClient.invalidateQueries({ queryKey: keys.attendance.breakHistory() })
      queryClient.invalidateQueries({ queryKey: keys.attendance.breakSummary() })
      notify.success(t("attendance.editEntry.success"))
      setPendingBreaks([])
      setRemovingBreaks([])
      setOpen(false)
    },
    onError: (err: Error) => {
      notify.error(err.message || t("attendance.editEntry.error"))
    },
  })

  const remove = useMutation({
    mutationFn: () => attendanceApi.deleteEntry(entry.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.attendance.list() })
      queryClient.invalidateQueries({ queryKey: keys.attendance.approvals() })
      notify.success(t("attendance.editEntry.deleteSuccess", "Entry removed"))
      setOpen(false)
    },
    onError: (err: Error) => notify.error(err.message || t("attendance.editEntry.error")),
  })

  const clockOutBeforeIn =
    !!clockIn && !!clockOut && zonedInputToUtc(clockOut, tz) <= zonedInputToUtc(clockIn, tz)
  const busy = mutation.isPending || remove.isPending
  const canSubmit = !!reason.trim() && !!clockIn && !clockOutBeforeIn && !busy

  return {
    t,
    user,
    open,
    setOpen,
    tz,
    clockIn,
    setClockIn,
    clockOut,
    setClockOut,
    notes,
    setNotes,
    reason,
    setReason,
    confirmDelete,
    setConfirmDelete,
    addingBreak,
    setAddingBreak,
    breakStart,
    setBreakStart,
    breakEnd,
    setBreakEnd,
    breakType,
    setBreakType,
    breakReason,
    setBreakReason,
    removingBreaks,
    setRemovingBreaks,
    pendingBreaks,
    setPendingBreaks,
    typedBreak,
    existingBreaks,
    changeTz,
    openWith,
    mutation,
    remove,
    clockOutBeforeIn,
    busy,
    canSubmit,
  }
}

/** What EditEntryDialog and its sections read. */
export type EditEntryDialogState = ReturnType<typeof useEditEntryDialog>
