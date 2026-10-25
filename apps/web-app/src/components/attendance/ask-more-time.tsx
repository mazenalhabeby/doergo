"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Hourglass, Loader2 } from "lucide-react"
import { mayAskForMoreTime, type TimeEntry } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"

/**
 * "Ask for more time" — the ONE extra-time request (the same route the phone
 * uses). A "no" from the leader never clocks anybody out; time after the planned
 * end simply is not counted. While it waits, the line says so instead.
 * Offered by the shared rule (`mayAskForMoreTime`): a real planned end — never a no-shift day or the daily-hours
 * marker — and the shift-scheduling Option, which the server requires (clock review A8, B2).
 */
export function AskMoreTime({ entry, compact = false }: { entry: TimeEntry | null | undefined; compact?: boolean }) {
  const { hasPlanFeature } = useAuth()
  if (!entry) return null
  if (entry.reminderState === "OVERTIME_PENDING") return <AskMoreTimeWaiting />
  if (!mayAskForMoreTime(entry, { hasOption: hasPlanFeature("shift_scheduling") })) return null
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
