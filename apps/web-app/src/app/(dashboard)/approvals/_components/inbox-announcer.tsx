"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

/**
 * The inbox's one spoken line: how many things wait — said only when that number CHANGES (a decision made here,
 * an item arriving or settled elsewhere), never on a refresh that brought nothing new and never on the first read.
 * A decision itself is said by its toast.
 */
export function InboxAnnouncer({ count }: { count: number | null }) {
  const { t } = useTranslation()
  const last = useRef<number | null>(null)
  const [said, setSaid] = useState("")
  useEffect(() => {
    if (count == null) return
    if (last.current != null && last.current !== count) setSaid(t("approvals.day.count", { count }))
    last.current = count
  }, [count, t])
  return (
    <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {said}
    </span>
  )
}
