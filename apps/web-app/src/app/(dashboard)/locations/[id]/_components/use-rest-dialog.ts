"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { attendanceApi, type BreakRuleRow } from "@/lib/api"
import { keys } from "@/lib/query-keys"

/** RestDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useRestDialog({
  spaceId,
  rule,
  onClose,
}: Pick<{
  spaceId: string
  rule: BreakRuleRow | null
  onClose: () => void
}, 'spaceId' | 'rule' | 'onClose'>) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const [name, setName] = useState(rule?.name ?? "")
  const [trigger, setTrigger] = useState<"LOCAL_WINDOW" | "AFTER_WORKED">(rule?.trigger ?? "LOCAL_WINDOW")
  const [earliest, setEarliest] = useState(rule?.earliestLocal ?? "12:00")
  const [latest, setLatest] = useState(rule?.latestLocal ?? "")
  const [afterHours, setAfterHours] = useState(String(Math.floor((rule?.afterMinutes ?? 300) / 60)))
  const [duration, setDuration] = useState(String(rule?.durationMinutes ?? 30))
  const [isPaid, setIsPaid] = useState(rule?.isPaid ?? false)
  const [isRequired, setIsRequired] = useState(rule?.isRequired ?? true)
  const [remind, setRemind] = useState(rule?.remind ?? true)
  const [snoozeMin, setSnoozeMin] = useState(String(rule?.snoozeMin ?? 15))

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        spaceId,
        name: name.trim() || t("attendance.rests.defaultName", "Rest"),
        trigger,
        afterMinutes: trigger === "AFTER_WORKED" ? Math.round(Number(afterHours) * 60) : undefined,
        earliestLocal: trigger === "LOCAL_WINDOW" ? earliest : undefined,
        latestLocal: trigger === "LOCAL_WINDOW" && latest ? latest : undefined,
        durationMinutes: Number(duration),
        isPaid,
        isRequired,
        remind,
        snoozeMin: Number(snoozeMin),
      }
      return rule
        ? attendanceApi.updateBreakRule(rule.id, payload)
        : attendanceApi.createBreakRule(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.schedules.breakRules(spaceId) })
      notify.success(rule ? t("attendance.rests.updated", "Rest updated") : t("attendance.rests.added", "Rest added"))
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return {
    t,
    name,
    setName,
    trigger,
    setTrigger,
    earliest,
    setEarliest,
    latest,
    setLatest,
    afterHours,
    setAfterHours,
    duration,
    setDuration,
    isPaid,
    setIsPaid,
    isRequired,
    setIsRequired,
    remind,
    setRemind,
    snoozeMin,
    setSnoozeMin,
    save,
  }
}

/** What RestDialog and its sections read. */
export type RestDialogState = ReturnType<typeof useRestDialog>
