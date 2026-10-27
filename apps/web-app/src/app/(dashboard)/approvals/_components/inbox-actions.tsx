"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { formatTimeAgo } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/** The inbox's header actions: when it was read, and reading it again. */
export function InboxActions({
  updatedAt,
  fetching,
  onRefresh,
}: {
  updatedAt: number
  fetching: boolean
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  // "Updated 2 minutes ago" keeps counting while the page stays open, rather than freezing at "just now".
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <>
      {updatedAt > 0 && (
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {t("approvals.updated", { time: formatTimeAgo(updatedAt) })}
        </span>
      )}
      <Button
        variant="outline"
        size="pillIcon"
        onClick={onRefresh}
        disabled={fetching}
        aria-label={t("approvals.refresh")}
      >
        <RefreshCw className={cn(fetching && "animate-spin")} />
      </Button>
    </>
  )
}
