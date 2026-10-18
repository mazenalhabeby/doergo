"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Hourglass, Loader2 } from "lucide-react"
import type { TimeEntry } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { mayAskMoreTime } from "./ask-more-time-rule"
export { mayAskMoreTime } from "./ask-more-time-rule"

/**
 * "Ask for more time" — the ONE extra-time request (the same route the phone
 * uses). A "no" from the leader never clocks anybody out; time after the planned
 * end simply is not counted. While it waits, the line says so instead.
 * Hook-free until there is something to show (the navbar renders it on every page).
 */
export function AskMoreTime({ entry, compact = false }: { entry: TimeEntry | null | undefined; compact?: boolean }) {
  if (!entry) return null
  if (entry.reminderState === "OVERTIME_PENDING") return <AskMoreTimeWaiting />
  if (!mayAskMoreTime(entry)) return null
  return <AskMoreTimeButton entryId={entry.id} compact={compact} />
}

function AskMoreTimeWaiting() {
  const { t } = useTranslation()
  return <span className="text-xs text-muted-foreground">{t("attendance.my.askMoreTimeWaiting")}</span>
}

function AskMoreTimeButton({ entryId, compact }: { entryId: string; compact: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const ask = useMutation({
    // Loaded on the press: the navbar carries this button on every page, the API client need not come with it.
    mutationFn: async () => (await import("@/lib/api")).attendanceApi.requestExtraTime(entryId),
    onSuccess: () => {
      notify.success(t("attendance.my.askMoreTimeSent"))
      qc.invalidateQueries({ queryKey: keys.attendance.myStatus() })
    },
    onError: (e: Error) => notify.error(e.message),
  })
  return (
    <Button
      size="sm"
      variant={compact ? "ghost" : "outline"}
      className={compact ? "h-6 gap-1 px-2 text-xs" : "gap-1.5 rounded-xl"}
      disabled={ask.isPending}
      onClick={() => ask.mutate()}
    >
      {ask.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Hourglass className="size-3.5" />}
      {t("attendance.my.askMoreTime")}
    </Button>
  )
}
