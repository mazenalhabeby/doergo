"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { attendanceApi, type TimeEntry } from "@/lib/api"
import { notify } from "@/lib/toast"
import { utcToZonedInput, zonedInputToUtc } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { keys } from "@/lib/query-keys"
import { useEntryBreakQueue } from "./use-entry-break-queue"

/** EditEntryDialog's form: the corrected times, note, reason, the break queue, and Save / Remove. */
export function useEditEntryDialog(entry: TimeEntry) {
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
  const breaks = useEntryBreakQueue(entry.id, tz, open)
  const { removingBreaks, setRemovingBreaks, pendingBreaks, setPendingBreaks, typedBreak, setAddingBreak } = breaks

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
          type: b.type,
          startedAt: b.startedAt,
          endedAt: b.endedAt,
          reason: b.reason,
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

  const clockOutBeforeIn = !!clockIn && !!clockOut && zonedInputToUtc(clockOut, tz) <= zonedInputToUtc(clockIn, tz)
  const busy = mutation.isPending || remove.isPending
  const canSubmit = !!reason.trim() && !!clockIn && !clockOutBeforeIn && !busy

  return {
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
    breaks,
    changeTz,
    openWith,
    mutation,
    remove,
    clockOutBeforeIn,
    busy,
    canSubmit,
  }
}
