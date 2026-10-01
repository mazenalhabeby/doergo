"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CLOCK_GATE_CODES } from "@hbcfield/shared/client"
import { useClockIn } from "./use-clock-in"

/**
 * "You're not clocked in" on the web — the other half of the job-start rule
 * (packages/shared/src/tasks/clock-gate.ts). ONE hook for every screen that
 * moves a task: the task page and the board both hand it their refusal.
 *
 * The server decides; this only answers its refusal. When the person moving the
 * job is the one who must clock in, the dialog offers to clock them in (the same
 * flow as the navbar clock: workspace choice, location) and then repeats the
 * move by itself. When it is somebody else who must clock in, there is nothing
 * to offer here — the caller shows the translated refusal as usual.
 */
export function useClockGate() {
  const clock = useClockIn()
  const [open, setOpen] = useState(false)
  // The move to repeat once the clock-in lands.
  const retry = useRef<(() => void) | null>(null)

  /** Hand it a failed move. True = it was "clock in first", and the dialog is now open. */
  const intercept = useCallback((error: unknown, again: () => void): boolean => {
    if ((error as { code?: string } | null)?.code !== CLOCK_GATE_CODES.SELF) return false
    retry.current = again
    setOpen(true)
    return true
  }, [])

  // The clock-in landed: carry on with the move that was waiting for it.
  useEffect(() => {
    if (!clock.clockedIn || !retry.current) return
    const again = retry.current
    retry.current = null
    setOpen(false)
    again()
  }, [clock.clockedIn])

  const close = useCallback(() => {
    retry.current = null
    setOpen(false)
  }, [])

  return {
    intercept,
    /** Spread into <ClockGateDialog {...dialogProps} />. */
    dialogProps: {
      open,
      onClose: close,
      pending: clock.pending,
      onClockIn: () => clock.startClockIn(),
      pickerProps: clock.pickerProps,
    },
  }
}
