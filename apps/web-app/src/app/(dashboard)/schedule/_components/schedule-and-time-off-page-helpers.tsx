"use client"

import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import { COVER_TONE } from "../_lib/cover-labels"

/** ScheduleAndTimeOffPage's module-level helpers, moved here unchanged so its sections can read them too. */
// The drawer is a decision somebody may never open — loaded when they do.
export const LeaveDecisionDrawer = dynamic(
  () => import("./leave-decision-drawer").then((m) => m.LeaveDecisionDrawer),
  { ssr: false },
)

export function Stat({
  n,
  tone,
  title,
  sub,
}: {
  n: number
  tone: keyof typeof COVER_TONE
  title: string
  sub: string
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4">
      <span className={cn("text-[26px] font-bold leading-none tabular-nums", n ? COVER_TONE[tone].text : "text-foreground")}>
        {n}
      </span>
      <span className="text-[12.5px] leading-snug text-muted-foreground">
        <b className="block text-[13px] font-semibold text-foreground">{title}</b>
        {sub}
      </span>
    </div>
  )
}
