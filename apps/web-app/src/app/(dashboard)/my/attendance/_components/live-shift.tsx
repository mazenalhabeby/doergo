"use client"

import { useEffect, useState } from "react"
import { ProgressRing } from "@/components/common/progress-ring"

/**
 * The clock that is actually running.
 *
 * A shift in progress is the one thing on this page that changes while somebody
 * looks at it, and a number frozen at the moment the page loaded says the
 * opposite of what a live shift is.
 *
 * Its own component on purpose: a second-by-second tick in the page would
 * re-render the history list, the week strip and every button sixty times a
 * minute. Here it re-renders one span.
 */
export function LiveShift({ since, target }: { since: string; target: { start: number; totalMins: number } | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const mins = Math.max(0, (now - new Date(since).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = Math.floor(mins % 60)
  const sec = Math.floor((mins * 60) % 60)

  return (
    <div className="flex items-center gap-4">
      {target && (
        <ProgressRing
          value={Math.min(mins, target.totalMins)}
          total={target.totalMins}
          label={`${Math.round((Math.min(mins, target.totalMins) / target.totalMins) * 100)}%`}
          size={64}
        />
      )}
      <div>
        <div className="text-[34px] font-semibold leading-none tracking-[-0.045em] tabular-nums text-foreground">
          {h}:{String(m).padStart(2, "0")}
          <span className="text-base text-muted-foreground">:{String(sec).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  )
}
