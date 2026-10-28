"use client"

import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  dayMatchesFilter,
  memberKey,
  type ApprovalDay,
  type ApprovalFilter,
  type ApprovalInbox,
  type ApprovalItem,
} from "@hbcfield/shared/client"
import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { serverErrorMessage } from "@/lib/server-error"
import { KIND_KEYS } from "../_lib/approval-keys"

/**
 * The inbox's working days: one row per person and day where they have two or
 * more time items, those items hidden from the list (they are opened from the
 * day). "Approve day" replays each through its own route on the gateway.
 */
export function useApprovalDays(
  data: ApprovalInbox | undefined,
  filter: ApprovalFilter,
  onDone: (dayKey: string) => void,
) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const days = useMemo(() => data?.days ?? [], [data])
  const grouped = useMemo(() => new Set(days.flatMap((d) => d.members.map(memberKey))), [days])
  // A day is shown under a filter when any of its items is (a kind, or one waiting for the reader).
  const visibleDays = useMemo(() => {
    if (filter === "all") return days
    const byKey = new Map((data?.items ?? []).map((i) => [memberKey(i), i]))
    return days.filter((d) =>
      dayMatchesFilter(
        d.members.map((m) => byKey.get(memberKey(m)) ?? { kind: m.kind }),
        filter,
      ),
    )
  }, [days, data, filter])
  /** The items a day holds, read from the list (the day only names them). */
  const membersOf = useCallback(
    (day: ApprovalDay): ApprovalItem[] => {
      const set = new Set(day.members.map(memberKey))
      return (data?.items ?? []).filter((i) => set.has(memberKey(i)))
    },
    [data],
  )

  const approveDay = useMutation({
    mutationFn: (day: ApprovalDay) => approvalsApi.decideDay(day.approvable),
    onSuccess: (res, day) => {
      const failed = res.results.find((r) => !r.ok)
      const waiting = res.results.find((r) => r.waitingFor)
      if (!failed && waiting) {
        notify.success(
          t("approvals.day.partly", { what: t(`approvals.kinds.${waiting.kind}`), role: waiting.waitingFor }),
        )
      } else if (failed) {
        notify.error(
          t("approvals.day.stopped", {
            what: t(`approvals.kinds.${failed.kind}`),
            // The server's words are English: a coded refusal is said in the reader's language.
            reason: serverErrorMessage({ code: failed.code, message: failed.message ?? failed.code ?? "" }, t),
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
