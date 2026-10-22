"use client"

import { useState } from "react"
import { todayKey } from "@hbcfield/shared/client"
import { type RecurringFrequency } from "@/lib/api"

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
