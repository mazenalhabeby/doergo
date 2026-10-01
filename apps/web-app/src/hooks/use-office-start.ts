"use client"

import { useCallback, useRef, useState } from "react"
import { OFFICE_START_CODES } from "@hbcfield/shared/client"
import type { OnBehalf } from "@/lib/api"

/**
 * The office starting somebody's job for them (packages/shared/src/tasks/job-time.ts).
 *
 * The server decides — it refuses a move of somebody else's job into work
 * without a reason, naming the person and their clock-in. This hook answers
 * that refusal: it opens the dialog, and repeats the SAME move with the reason
 * (and the time it really started, when given). ONE hook for every screen that
 * moves a task, like `useClockGate`.
 */
export function useOfficeStart() {
  const [ask, setAsk] = useState<{ name: string; clockInAt: string | null } | null>(null)
  const again = useRef<((onBehalf: OnBehalf) => void) | null>(null)
  const [pending, setPending] = useState(false)

  /** Hand it a failed move. True = it was "say why", and the dialog is now open. */
  const intercept = useCallback((error: unknown, retry: (onBehalf: OnBehalf) => void): boolean => {
    const e = error as { code?: string; params?: { name?: string; clockInAt?: string | null } } | null
    if (e?.code !== OFFICE_START_CODES.REASON_REQUIRED) return false
    again.current = retry
    setPending(false)
    setAsk({ name: e.params?.name ?? "", clockInAt: e.params?.clockInAt ?? null })
    return true
  }, [])

  const close = useCallback(() => { again.current = null; setAsk(null); setPending(false) }, [])
  const confirm = useCallback((onBehalf: OnBehalf) => {
    const retry = again.current
    again.current = null
    setPending(true)
    setAsk(null)
    retry?.(onBehalf)
    setPending(false)
  }, [])

  return {
    intercept,
    /** Spread into <OfficeStartDialog {...dialogProps} />. */
    dialogProps: { open: !!ask, name: ask?.name ?? "", clockInAt: ask?.clockInAt ?? null, pending, onClose: close, onConfirm: confirm },
  }
}
