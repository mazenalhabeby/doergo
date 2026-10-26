"use client"

import { useQuery } from "@tanstack/react-query"
import { Notice } from "@/components/page/page-kit"
import { useTranslation } from "react-i18next"
import { Hourglass } from "lucide-react"
import { formatDuration } from "@hbcfield/shared/client"
import { overtimeApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { dateLocale } from "@/lib/format-date"

/**
 * "1h 30m outside your shift on 23 Oct is waiting for Anna" — the member's own time outside the planned shift
 * that nobody has decided yet (clock review C10: only the phone said so). The same read and the same words as
 * the phone; nothing when there is nothing waiting.
 */
export function OutsideWaiting() {
  const { t } = useTranslation()
  const { data: items = [] } = useQuery({
    queryKey: keys.attendance.myOutsideWaiting(),
    queryFn: () => overtimeApi.outsideMine(),
    staleTime: 60_000,
  })
  if (!items.length) return null
  return (
    <div className="mb-6 space-y-2">
      {items.slice(0, 3).map((w) => {
        const names = w.askedOf.names.join(", ")
        const who = w.askedOf.more ? t("attendance.outside.andMore", { names, count: w.askedOf.more }) : names
        const params = {
          duration: formatDuration(w.total),
          day: new Date(`${w.date}T12:00:00`).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" }),
          names: who,
        }
        return (
          <Notice key={w.entryId} tone="warn" className="mb-0 font-medium">
            <Hourglass />
            {who ? t("attendance.outside.waiting", params) : t("attendance.outside.waitingNoName", params)}
          </Notice>
        )
      })}
    </div>
  )
}
