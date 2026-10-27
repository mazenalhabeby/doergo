"use client"

import { AlertTriangle, UserRoundCheck } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { ApprovalKind } from "@hbcfield/shared/client"
import { formatTimeAgo } from "@/lib/format-date"
import { Notice } from "@/components/page/page-kit"
import { useTick } from "../_hooks/use-tick"
import { InboxAnnouncer } from "./inbox-announcer"

/**
 * The lines above the inbox, on its own tab only: whose decisions the reader covers today, the kinds that could
 * not be read, and a refresh that failed while the last good list stays on screen (never swapped for an error).
 */
export function InboxNotices({
  covering,
  unavailable,
  staleSince,
  count,
}: {
  covering: string[]
  unavailable: ApprovalKind[]
  /** When the list on screen was read, if the latest refresh failed; null otherwise. */
  staleSince: number | null
  /** How many wait, once read (null while loading) — said aloud only when it CHANGES. */
  count: number | null
}) {
  const { t } = useTranslation()
  // "The list as it was 5 minutes ago" keeps counting, as "Updated …" does.
  useTick()
  return (
    <>
      <InboxAnnouncer count={count} />
      {staleSince != null && (
        <Notice tone="warn">
          <AlertTriangle />
          {t("approvals.refreshFailed", { time: formatTimeAgo(staleSince) })}
        </Notice>
      )}
      {covering.length > 0 && (
        <Notice>
          <UserRoundCheck />
          {t("approvals.standIn.covering", { names: covering.join(", ") })}
        </Notice>
      )}
      {unavailable.length > 0 && (
        <Notice tone="warn">
          <AlertTriangle />
          {t("approvals.unavailable", { kinds: unavailable.map((k) => t(`approvals.kinds.${k}`)).join(", ") })}
        </Notice>
      )}
    </>
  )
}
