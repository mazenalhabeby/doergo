"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { type BreakKind } from "@/components/attendance/break-fields"
import { attendanceApi } from "@/lib/api"
import { zonedInputToUtc } from "@/lib/utils"
import { keys } from "@/lib/query-keys"

/** A break queued in the edit dialog, written on Save. */
export interface QueuedBreak {
  type: "SHORT" | "LUNCH" | "OTHER"
  startedAt: string
  endedAt: string
  reason: string
  label: string
}

/**
 * The breaks an attendance correction will remove and add: the shift's recorded breaks, the
 * add-a-break form, and the queue Save writes. `tz` is the zone the dialog's clock fields use.
 */
export function useEntryBreakQueue(entryId: string, tz: string, open: boolean) {
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
  const [pendingBreaks, setPendingBreaks] = useState<QueuedBreak[]>([])

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
    queryKey: keys.attendance.entryBreaks(entryId),
    queryFn: () => attendanceApi.entryBreaks(entryId),
    enabled: open,
  })

  return {
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
  }
}

/** The break queue's state, as the dialog's break editor reads it. */
export type EntryBreakQueue = ReturnType<typeof useEntryBreakQueue>
