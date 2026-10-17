"use client"

import { useState, useEffect } from "react"
import { todayKey } from "@hbcfield/shared/client"
import { type RecurringFrequency } from "@/lib/api"
import { useActiveSpaces } from "@/hooks/use-space-directory"

/*
  Two parts of useCreateTaskForm, moved here unchanged. The form calls each hook at the point
  its code used to be, so the same hooks run in the same order.
*/

/** The Repeat section's state. */
export function useRepeatState() {
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>("WEEKLY")
  const [customDays, setCustomDays] = useState<number>(7)
  const [dayOfWeek, setDayOfWeek] = useState<number>(1)
  const [dayOfMonth, setDayOfMonth] = useState<number>(1)
  const [recurStart, setRecurStart] = useState<string>(() => todayKey())
  const [recurEnd, setRecurEnd] = useState<string>("")

  return {
    isRecurring,
    setIsRecurring,
    frequency,
    setFrequency,
    customDays,
    setCustomDays,
    dayOfWeek,
    setDayOfWeek,
    dayOfMonth,
    setDayOfMonth,
    recurStart,
    setRecurStart,
    recurEnd,
    setRecurEnd,
  }
}

/** The workspaces offered, and the default one picked once they load. */
export function useTaskSpaces({
  open,
  spaceId,
  setSpaceId,
  defaultSpaceId,
}: {
  open: boolean
  spaceId: string
  setSpaceId: (id: string) => void
  defaultSpaceId?: string | null
}) {
  const { data: availableSpaces = [] } = useActiveSpaces({ enabled: open })
  const hasSpaces = availableSpaces.length > 0

  // Every task belongs to a space — once spaces load, default the picker to the
  // org's "General" (default) space instead of leaving it unselected.
  useEffect(() => {
    if (open && spaceId === "none" && !defaultSpaceId && availableSpaces.length) {
      const def =
        availableSpaces.find((s) => s.isDefault) ??
        availableSpaces.find((s) => s.name === "General") ??
        availableSpaces[0]
      if (def?.id) setSpaceId(def.id)
    }
  }, [open, availableSpaces, defaultSpaceId, spaceId])

  return { availableSpaces, hasSpaces }
}
