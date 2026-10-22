"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { memberKey, type ApprovalDay, type ApprovalInbox, type ApprovalItem } from "@hbcfield/shared/client"
import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { KIND_KEYS, type Filter } from "../_lib/approval-keys"

/** A day is shown under a filter when any of its items is of that kind. */
const dayMatches = (d: ApprovalDay, filter: Filter) => filter === "all" || d.members.some((m) => m.kind === filter)

/**
 * The inbox's working days: one row per person and day where they have two or
 * more time items, those items hidden from the list (they are opened from the
 * day). "Approve day" replays each through its own route on the gateway.
 */
export function useApprovalDays(data: ApprovalInbox | undefined, filter: Filter, onDone: (dayKey: string) => void) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const days = useMemo(() => data?.days ?? [], [data])
  const grouped = useMemo(() => new Set(days.flatMap((d) => d.members.map(memberKey))), [days])
  const visibleDays = useMemo(() => days.filter((d) => dayMatches(d, filter)), [days, filter])
  /** The items a day holds, read from the list (the day only names them). */
  const membersOf = (day: ApprovalDay): ApprovalItem[] => {
    const set = new Set(day.members.map(memberKey))
    return (data?.items ?? []).filter((i) => set.has(memberKey(i)))
  }

  const approveDay = useMutation({
    mutationFn: (day: ApprovalDay) => approvalsApi.decideDay(day.approvable),
    onSuccess: (res, day) => {
      const failed = res.results.find((r) => !r.ok)
      if (failed) {
        notify.error(
          t("approvals.day.stopped", {
            what: t(`approvals.kinds.${failed.kind}`),
            reason: failed.message ?? failed.code ?? "",
          }),
        )
      } else {
        notify.success(t("approvals.day.approved", { name: day.subject.name || t("approvals.someone") }))
        onDone(day.key)
      }
      qc.invalidateQueries({ queryKey: keys.approvals.all() })
      for (const k of new Set(day.members.flatMap((m) => KIND_KEYS[m.kind] ?? [])))
        qc.invalidateQueries({ queryKey: k })
    },
    onError: (e: Error) => {
      notify.error(e.message)
      qc.invalidateQueries({ queryKey: keys.approvals.all() })
    },
  })

  return { days, grouped, visibleDays, membersOf, approveDay }
}
